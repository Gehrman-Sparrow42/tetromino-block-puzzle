import {
  ONLINE_VERSION,
  ROOM_CODE,
  validName,
  validBalance,
  type PlayerBalance,
  type ClientMessage,
  type OnlineInput,
  type ServerMessage,
} from "./protocol";

const DEFAULT_CONNECT_TIMEOUT_MS = 5_000;
const MAX_BUFFERED_BYTES = 64 * 1024;

type SocketFactory = (url: string) => WebSocket;

export interface OnlineClientOptions {
  connectTimeoutMs?: number;
  webSocketFactory?: SocketFactory;
  /** Opt-in for an HTTP playtest on a trusted private IPv4 LAN. Never for public hosting. */
  allowInsecureLocalNetwork?: boolean;
}

export type OnlineClientStatus =
  "idle" | "connecting" | "connected" | "disconnected" | "closed";

export class OnlineClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OnlineClientError";
  }
}

function validateUrl(value: string, allowLocalNetwork = false): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new OnlineClientError(
      "WebSocket URL must be an absolute ws:// or wss:// URL.",
    );
  }

  if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    throw new OnlineClientError("WebSocket URL must use ws:// or wss://.");
  }
  if (url.username || url.password) {
    throw new OnlineClientError("WebSocket URLs cannot contain credentials.");
  }
  if (url.hash) {
    throw new OnlineClientError("WebSocket URLs cannot contain a fragment.");
  }
  const loopback =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]";
  const parts = url.hostname.split(".").map(Number);
  const privateIPv4 =
    parts.length === 4 &&
    parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) &&
    (parts[0] === 10 ||
      (parts[0] === 172 && parts[1]! >= 16 && parts[1]! <= 31) ||
      (parts[0] === 192 && parts[1] === 168));
  if (
    url.protocol === "ws:" &&
    !loopback &&
    !(allowLocalNetwork && privateIPv4)
  ) {
    throw new OnlineClientError(
      "Use wss:// outside loopback, or explicitly enable a private LAN playtest.",
    );
  }
  return url.href;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

const PIECES = new Set(["I", "O", "T", "S", "Z", "J", "L"]);

function validRoom(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.hostId === undefined || typeof value.hostId === "string") &&
    typeof value.code === "string" &&
    ROOM_CODE.test(value.code) &&
    (value.mode === "survival" || value.mode === "battle") &&
    ["waiting", "countdown", "playing", "finished"].includes(
      String(value.phase),
    ) &&
    Array.isArray(value.players) &&
    value.players.every(
      (player) =>
        isRecord(player) &&
        typeof player.id === "string" &&
        typeof player.name === "string" &&
        typeof player.ready === "boolean" &&
        (player.balance === undefined || validBalance(player.balance)),
    ) &&
    (value.startAt === null || typeof value.startAt === "number") &&
    (value.winnerId === null || typeof value.winnerId === "string") &&
    (value.resultReason === null ||
      ["topout", "disconnect", "draw"].includes(String(value.resultReason)))
  );
}

function validBoard(value: unknown): boolean {
  if (isRecord(value))
    for (const key of ["incoming", "sent"]) {
      if (
        value[key] !== undefined &&
        (!Number.isSafeInteger(value[key]) || Number(value[key]) < 0)
      )
        return false;
    }
  if (
    !isRecord(value) ||
    !Array.isArray(value.board) ||
    !value.board.every(
      (row) =>
        Array.isArray(row) &&
        row.every(
          (piece) =>
            piece === null || piece === "G" || PIECES.has(String(piece)),
        ),
    ) ||
    !(value.hold === null || PIECES.has(String(value.hold))) ||
    !PIECES.has(String(value.next)) ||
    !["playing", "paused", "gameover", "victory"].includes(String(value.status))
  )
    return false;
  if (
    value.active !== null &&
    (!isRecord(value.active) ||
      !PIECES.has(String(value.active.type)) ||
      !Number.isInteger(value.active.rotation) ||
      Number(value.active.rotation) < 0 ||
      Number(value.active.rotation) > 3 ||
      !Number.isInteger(value.active.x) ||
      !Number.isInteger(value.active.y))
  )
    return false;
  return ["score", "lines", "level", "elapsedMs", "piecesPlaced", "ack"].every(
    (key) => typeof value[key] === "number" && Number.isFinite(value[key]),
  );
}

function parseServerMessage(data: unknown): ServerMessage | null {
  if (typeof data !== "string") return null;
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    return null;
  }
  if (
    !isRecord(value) ||
    value.v !== ONLINE_VERSION ||
    typeof value.type !== "string"
  )
    return null;

  switch (value.type) {
    case "welcome":
      return typeof value.playerId === "string" && value.playerId.length > 0
        ? (value as ServerMessage)
        : null;
    case "room":
      return validRoom(value.room) ? (value as ServerMessage) : null;
    case "snapshot":
      return Number.isSafeInteger(value.frame) &&
        validRoom(value.room) &&
        isRecord(value.boards) &&
        Object.values(value.boards).every(validBoard)
        ? (value as ServerMessage)
        : null;
    case "left":
      return value as ServerMessage;
    case "error":
      return typeof value.code === "string" && typeof value.message === "string"
        ? (value as ServerMessage)
        : null;
    default:
      return null;
  }
}

/** Native WebSocket client for the versioned Afterblock online protocol. */
export class OnlineClient {
  private readonly url: string;
  private readonly timeoutMs: number;
  private readonly socketFactory: SocketFactory;
  private socket: WebSocket | null = null;
  private connecting: Promise<void> | null = null;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private rejectHandshake: ((error: Error) => void) | null = null;
  private listeners = new Set<(message: ServerMessage) => void>();
  private statusListeners = new Set<(status: OnlineClientStatus) => void>();
  private _status: OnlineClientStatus = "idle";
  private _playerId: string | null = null;
  private sequence = 0;
  private roomCode: string | null = null;
  private closed = false;

  constructor(url: string, options: OnlineClientOptions = {}) {
    this.url = validateUrl(url, options.allowInsecureLocalNetwork);
    this.timeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new OnlineClientError(
        "connectTimeoutMs must be a positive finite number.",
      );
    }
    this.socketFactory =
      options.webSocketFactory ?? ((socketUrl) => new WebSocket(socketUrl));
  }

  get playerId(): string | null {
    return this._playerId;
  }

  get status(): OnlineClientStatus {
    return this._status;
  }

  connect(): Promise<void> {
    if (this._playerId) return Promise.resolve();
    if (this.connecting) return this.connecting;
    if (this.closed)
      return Promise.reject(
        new OnlineClientError("This client has been closed."),
      );

    this.setStatus("connecting");
    let socket: WebSocket;
    try {
      socket = this.socketFactory(this.url);
    } catch (error) {
      this.setStatus("disconnected");
      return Promise.reject(
        new OnlineClientError(
          `Could not create WebSocket: ${errorMessage(error)}`,
        ),
      );
    }
    this.socket = socket;

    this.connecting = new Promise<void>((resolve, reject) => {
      let settled = false;
      const cleanupHandshake = () => {
        if (this.timeout !== null) clearTimeout(this.timeout);
        this.timeout = null;
      };
      const fail = (message: string) => {
        if (settled) return;
        settled = true;
        this.rejectHandshake = null;
        cleanupHandshake();
        this.resetConnection(socket);
        if (!this.closed) this.setStatus("disconnected");
        reject(new OnlineClientError(message));
      };
      this.rejectHandshake = (error) => fail(error.message);
      this.timeout = setTimeout(() => {
        fail(
          `Timed out waiting for the server welcome message after ${this.timeoutMs} ms.`,
        );
        try {
          socket.close();
        } catch {
          /* socket may already be gone */
        }
      }, this.timeoutMs);

      socket.onmessage = (event: MessageEvent) => {
        const message = parseServerMessage(event.data);
        if (!message) {
          fail("Server sent a malformed or unsupported protocol message.");
          try {
            socket.close(1002, "Invalid protocol message");
          } catch {
            /* already closed */
          }
          return;
        }
        if (!settled) {
          if (message.type !== "welcome") {
            fail(
              "Server sent a message before the welcome handshake completed.",
            );
            try {
              socket.close(1002, "Welcome required");
            } catch {
              /* already closed */
            }
            return;
          }
          this._playerId = message.playerId;
          settled = true;
          this.rejectHandshake = null;
          cleanupHandshake();
          this.setStatus("connected");
          resolve();
        } else if (message.type === "welcome") {
          fail("Server sent a duplicate welcome message.");
          try {
            socket.close(1002, "Duplicate welcome");
          } catch {
            /* already closed */
          }
          return;
        }

        this.updateRoomState(message);
        this.emit(message);
      };
      socket.onerror = () => {
        if (!settled) {
          fail(
            "WebSocket connection failed before the welcome handshake completed.",
          );
        } else {
          this.resetConnection(socket);
          this.setStatus("disconnected");
          try {
            socket.close();
          } catch {
            /* already closed */
          }
        }
      };
      socket.onclose = (event: CloseEvent) => {
        if (!settled) {
          fail(
            `WebSocket closed before welcome (code ${event.code}${event.reason ? `: ${event.reason}` : ""}).`,
          );
        } else {
          this.resetConnection(socket);
          this.setStatus("disconnected");
        }
      };
    });

    const pending = this.connecting;
    void pending
      .finally(() => {
        if (this.connecting === pending) this.connecting = null;
      })
      .catch(() => undefined);
    return pending;
  }

  subscribe(listener: (message: ServerMessage) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeStatus(listener: (status: OnlineClientStatus) => void): () => void {
    this.statusListeners.add(listener);
    try {
      listener(this._status);
    } catch {
      // A consumer callback must not escape the client API.
    }
    return () => this.statusListeners.delete(listener);
  }

  createRoom(name: string): void {
    this.send({ v: ONLINE_VERSION, type: "create", name: requireName(name) });
  }

  joinRoom(code: string, name: string): void {
    if (typeof code !== "string" || !ROOM_CODE.test(code)) {
      throw new OnlineClientError(
        "Room code must be six valid uppercase letters or digits.",
      );
    }
    this.send({
      v: ONLINE_VERSION,
      type: "join",
      code,
      name: requireName(name),
    });
  }

  setReady(ready: boolean): void {
    if (typeof ready !== "boolean")
      throw new OnlineClientError("Ready state must be a boolean.");
    this.send({ v: ONLINE_VERSION, type: "ready", ready });
  }

  setBalance(playerId: string, balance: PlayerBalance): void {
    if (!playerId || playerId.length > 64 || !validBalance(balance))
      throw new OnlineClientError(
        "Choose a valid player and balance settings.",
      );
    this.send({ v: ONLINE_VERSION, type: "balance", playerId, balance });
  }

  sendInput(command: OnlineInput): void {
    if (!this.roomCode)
      throw new OnlineClientError(
        "Join or create a room before sending game input.",
      );
    const seq = this.sequence + 1;
    this.send({ v: ONLINE_VERSION, type: "input", seq, command });
    this.sequence = seq;
  }

  leaveRoom(): void {
    this.send({ v: ONLINE_VERSION, type: "leave" });
    this.roomCode = null;
    this.sequence = 0;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.setStatus("closed");
    const socket = this.socket;
    this.rejectHandshake?.(
      new OnlineClientError(
        "Client closed before the welcome handshake completed.",
      ),
    );
    this.resetConnection(socket);
    if (socket && socket.readyState < WebSocket.CLOSING) {
      socket.close(1000, "Client closed");
    }
  }

  private send(message: ClientMessage): void {
    const socket = this.socket;
    if (!socket || !this._playerId || socket.readyState !== WebSocket.OPEN) {
      throw new OnlineClientError(
        "Connect and complete the welcome handshake before sending messages.",
      );
    }
    const payload = JSON.stringify(message);
    const byteLength = new TextEncoder().encode(payload).byteLength;
    if (socket.bufferedAmount + byteLength > MAX_BUFFERED_BYTES) {
      throw new OnlineClientError("WebSocket send buffer would exceed 64 KiB.");
    }
    try {
      socket.send(payload);
    } catch (error) {
      throw new OnlineClientError(
        `Could not send WebSocket message: ${errorMessage(error)}`,
      );
    }
  }

  private updateRoomState(message: ServerMessage): void {
    if (message.type === "room" || message.type === "snapshot") {
      const nextCode = message.room.code;
      if (nextCode !== this.roomCode) this.sequence = 0;
      this.roomCode = nextCode;
    } else if (message.type === "left") {
      this.roomCode = null;
      this.sequence = 0;
    }
  }

  private emit(message: ServerMessage): void {
    for (const listener of this.listeners) {
      try {
        listener(message);
      } catch {
        // A consumer callback must not escape a native WebSocket event handler.
      }
    }
  }

  private setStatus(status: OnlineClientStatus): void {
    if (this._status === status) return;
    this._status = status;
    for (const listener of this.statusListeners) {
      try {
        listener(status);
      } catch {
        // A consumer callback must not escape a native WebSocket event handler.
      }
    }
  }

  private resetConnection(socket: WebSocket | null): void {
    if (this.timeout !== null) clearTimeout(this.timeout);
    this.timeout = null;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
    }
    if (this.socket === socket) this.socket = null;
    this._playerId = null;
    this.roomCode = null;
    this.sequence = 0;
  }
}

export function addRoomLink(baseUrl: string, code: string): string {
  if (typeof code !== "string" || !ROOM_CODE.test(code)) {
    throw new OnlineClientError(
      "Room code must be six valid uppercase letters or digits.",
    );
  }
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new OnlineClientError(
      "Room link base must be an absolute HTTPS or loopback HTTP URL.",
    );
  }
  const loopback =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new OnlineClientError(
      "Room link bases must use HTTPS, or HTTP on localhost loopback.",
    );
  }
  if (url.username || url.password || url.hash) {
    throw new OnlineClientError(
      "Room link bases cannot contain credentials or a fragment.",
    );
  }
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/r/${code}`;
  url.search = "";
  return url.href;
}

function requireName(name: string): string {
  if (!validName(name)) {
    throw new OnlineClientError(
      "Player name must be 1 to 24 characters and contain no control characters.",
    );
  }
  return name.trim();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
