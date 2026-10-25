import { describe, expect, it, vi } from "vitest";
import { addRoomLink, OnlineClient, OnlineClientError } from "./client";

class MockSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readyState = MockSocket.CONNECTING;
  bufferedAmount = 0;
  sent: string[] = [];
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  close = vi.fn(() => {
    this.readyState = MockSocket.CLOSED;
  });
  send = vi.fn((data: string) => {
    this.sent.push(data);
  });

  open(): void {
    this.readyState = MockSocket.OPEN;
    this.onopen?.(new Event("open"));
  }

  message(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent);
  }

  welcome(id = "player-1"): void {
    this.message(JSON.stringify({ v: 1, type: "welcome", playerId: id }));
  }

  remoteClose(code = 1006, reason = "network loss"): void {
    this.readyState = MockSocket.CLOSED;
    this.onclose?.({ code, reason } as CloseEvent);
  }

  room(code = "ABC234"): void {
    this.message(
      JSON.stringify({
        v: 1,
        type: "room",
        room: {
          code,
          mode: "survival",
          phase: "waiting",
          players: [],
          startAt: null,
          winnerId: null,
          resultReason: null,
        },
      }),
    );
  }
}

function makeClient(url = "ws://localhost:8080", timeout = 100) {
  const socket = new MockSocket();
  const factory = vi.fn(() => socket as unknown as WebSocket);
  const client = new OnlineClient(url, {
    webSocketFactory: factory,
    connectTimeoutMs: timeout,
  });
  return { client, socket, factory };
}

describe("OnlineClient", () => {
  it("sends balance choices only after validation", async () => {
    const { client, socket } = makeClient();
    const connected = client.connect();
    socket.open();
    socket.welcome();
    await connected;
    const balance = {
      gravityPercent: 75,
      startingLevel: 4,
      speedMode: "fixed" as const,
    };
    client.setBalance("player-2", balance);
    expect(JSON.parse(socket.sent.at(-1)!)).toEqual({
      v: 1,
      type: "balance",
      playerId: "player-2",
      balance,
    });
    expect(() =>
      client.setBalance("player-2", { ...balance, gravityPercent: 110 }),
    ).toThrow(/valid/);
    expect(() => client.setBalance("", balance)).toThrow(/valid/);
    client.close();
  });
  it("validates secure URL policy and rejects credentials and fragments", () => {
    expect(() => new OnlineClient("ws://example.com")).toThrow(
      OnlineClientError,
    );
    expect(() => new OnlineClient("ws://user:pass@localhost")).toThrow(
      /credentials/,
    );
    expect(() => new OnlineClient("wss://example.com/#fragment")).toThrow(
      /fragment/,
    );
    expect(() => new OnlineClient("wss://example.com")).not.toThrow();
    expect(() => new OnlineClient("ws://[::1]:8080")).not.toThrow();
    expect(() => new OnlineClient("ws://192.168.1.10:8172/ws")).toThrow();
    for (const host of [
      "192.168.1.10",
      "10.0.0.2",
      "172.16.0.1",
      "172.31.255.254",
    ]) {
      expect(
        () =>
          new OnlineClient(`ws://${host}/ws`, {
            allowInsecureLocalNetwork: true,
          }),
      ).not.toThrow();
    }
    for (const host of [
      "example.com",
      "8.8.8.8",
      "172.32.0.1",
      "192.169.1.10",
    ]) {
      expect(
        () =>
          new OnlineClient(`ws://${host}/ws`, {
            allowInsecureLocalNetwork: true,
          }),
      ).toThrow();
    }
  });

  it("shares a pending connection and resolves only after welcome", async () => {
    const { client, socket, factory } = makeClient();
    const first = client.connect();
    const second = client.connect();
    expect(first).toBe(second);
    expect(factory).toHaveBeenCalledTimes(1);
    socket.open();
    let resolved = false;
    void first.then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);
    socket.welcome("abc");
    await first;
    expect(client.playerId).toBe("abc");
  });

  it("notifies status subscribers, reports remote loss, and can connect again", async () => {
    const sockets = [new MockSocket(), new MockSocket()];
    let socketIndex = 0;
    const client = new OnlineClient("ws://localhost", {
      webSocketFactory: () => sockets[socketIndex++] as unknown as WebSocket,
    });
    const statuses: string[] = [];
    client.subscribeStatus((status) => statuses.push(status));
    expect(statuses).toEqual(["idle"]);

    const firstConnection = client.connect();
    expect(client.status).toBe("connecting");
    sockets[0]!.open();
    sockets[0]!.welcome();
    await firstConnection;
    expect(client.status).toBe("connected");

    sockets[0]!.remoteClose();
    expect(client.status).toBe("disconnected");
    expect(client.playerId).toBeNull();

    const secondConnection = client.connect();
    expect(client.status).toBe("connecting");
    sockets[1]!.open();
    sockets[1]!.welcome("player-2");
    await secondConnection;
    expect(client.playerId).toBe("player-2");
    expect(statuses).toEqual([
      "idle",
      "connecting",
      "connected",
      "disconnected",
      "connecting",
      "connected",
    ]);
  });

  it("validates names and room codes before sending, then sequences room input", async () => {
    const { client, socket } = makeClient();
    const connected = client.connect();
    socket.open();
    socket.welcome();
    await connected;
    expect(() => client.createRoom("  \n ")).toThrow(OnlineClientError);
    expect(() => client.joinRoom("bad", "A")).toThrow(OnlineClientError);
    expect(socket.sent).toHaveLength(0);
    client.createRoom(" Alice ");
    expect(JSON.parse(socket.sent[0]!)).toMatchObject({
      type: "create",
      name: "Alice",
    });
    expect(() => client.sendInput({ type: "HARD_DROP" })).toThrow(
      /Join or create/,
    );
    socket.room("ABC234");
    client.sendInput({ type: "HARD_DROP" });
    client.sendInput({ type: "SOFT_DROP", active: true });
    expect(
      socket.sent.slice(-2).map((message) => JSON.parse(message).seq),
    ).toEqual([1, 2]);
    client.leaveRoom();
    expect(JSON.parse(socket.sent.at(-1)!)).toMatchObject({ type: "leave" });
    expect(() => client.sendInput({ type: "HARD_DROP" })).toThrow(
      /Join or create/,
    );
  });

  it("dispatches server errors as events and isolates listener exceptions", async () => {
    const { client, socket } = makeClient();
    const messages: unknown[] = [];
    client.subscribe(() => {
      throw new Error("consumer bug");
    });
    client.subscribe((message) => messages.push(message));
    const connected = client.connect();
    socket.open();
    socket.welcome();
    await connected;
    expect(() =>
      socket.message(
        JSON.stringify({
          v: 1,
          type: "error",
          code: "ROOM_FULL",
          message: "Full",
        }),
      ),
    ).not.toThrow();
    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatchObject({ type: "error", code: "ROOM_FULL" });
  });

  it("rejects malformed handshake data, times out, and lets close cancel a pending handshake", async () => {
    const malformed = makeClient();
    const malformedPromise = malformed.client.connect();
    malformed.socket.open();
    malformed.socket.message('{"v":2,"type":"welcome","playerId":"x"}');
    await expect(malformedPromise).rejects.toThrow(/malformed or unsupported/);

    vi.useFakeTimers();
    const timed = makeClient("ws://localhost", 25);
    const timedStatuses: string[] = [];
    timed.client.subscribeStatus((status) => timedStatuses.push(status));
    const timedPromise = timed.client.connect();
    const rejection = expect(timedPromise).rejects.toThrow(/Timed out/);
    await vi.advanceTimersByTimeAsync(25);
    await rejection;
    expect(timedStatuses).toEqual(["idle", "connecting", "disconnected"]);
    vi.useRealTimers();

    const closed = makeClient();
    const closeStatuses: string[] = [];
    closed.client.subscribeStatus((status) => closeStatuses.push(status));
    const closedPromise = closed.client.connect();
    closed.client.close();
    await expect(closedPromise).rejects.toThrow(/Client closed/);
    expect(closed.socket.close).toHaveBeenCalledOnce();
    expect(closeStatuses).toEqual(["idle", "connecting", "closed"]);
  });

  it("enforces the 64 KiB send buffer and closes idempotently", async () => {
    const { client, socket } = makeClient();
    const connected = client.connect();
    socket.open();
    socket.welcome();
    await connected;
    socket.bufferedAmount = 65_536;
    expect(() => client.setReady(true)).toThrow(/64 KiB/);
    socket.bufferedAmount = 0;
    client.close();
    client.close();
    expect(socket.close).toHaveBeenCalledOnce();
    expect(client.playerId).toBeNull();
    expect(() => client.setReady(true)).toThrow(/Connect and complete/);
  });

  it("builds shareable room paths under HTTPS or loopback HTTP", () => {
    expect(addRoomLink("https://game.example/play/", "ABC234")).toBe(
      "https://game.example/play/r/ABC234",
    );
    expect(addRoomLink("http://localhost:5173", "ABC234")).toBe(
      "http://localhost:5173/r/ABC234",
    );
    expect(() => addRoomLink("http://game.example", "ABC234")).toThrow(/HTTPS/);
    expect(() => addRoomLink("https://game.example", "ABC12I")).toThrow(
      /Room code/,
    );
  });
});
