import "./online-screen.css";
import { Capacitor } from "@capacitor/core";
import type {
  GameCommand,
  GameStateSnapshot,
  UserSettings,
} from "../contracts/game-contract";
import { OnlineClient } from "../online/client";
import {
  ATTACK_LEVELS,
  attackLabel,
  attackPercent,
  type BoardView,
  type OnlineInput,
  type RoomView,
} from "../online/protocol";
import { SHAPES, COLS, ROWS } from "../engine/constants";
import { drawBoard, drawPreview } from "./canvas-renderer";
import { applyTheme } from "./themes";
import { TouchControls } from "./touch-controls";
import {
  computeBoardGeometry,
  computeControlGeometry,
  computeRailGeometry,
  type ControlRect,
} from "./control-layout";

const ENDPOINT_KEY = "afterblock_online_endpoint_v1";
const NAME_KEY = "afterblock_online_name_v1";
const ACTIONS = [
  ["MOVE_LEFT", "←", "Left", "left"],
  ["SOFT_DROP", "↓", "Soft drop", "down"],
  ["MOVE_RIGHT", "→", "Right", "right"],
  ["HARD_DROP", "⇓", "Hard drop", "hardDrop"],
  ["HOLD", "⇄", "Hold", "hold"],
  ["ROTATE_CCW", "↶", "Rotate left", "rotateCCW"],
  ["ROTATE_CW", "↷", "Rotate right", "rotateCW"],
] as const;
function read(key: string) {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}
function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Connection still works without storage. */
  }
}
function defaultEndpoint(): string {
  const configured = import.meta.env.VITE_ONLINE_SERVER as string | undefined;
  if (configured?.trim()) return configured.trim();
  if (
    Capacitor.isNativePlatform() ||
    !["http:", "https:"].includes(location.protocol)
  )
    return "";
  const url = new URL("/ws", location.href);
  url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return url.href;
}
/** Render-only projection. The server alone advances the match; no local engine state is applied or saved. */
function snapshot(board: BoardView): GameStateSnapshot {
  let active: GameStateSnapshot["active"] = null;
  if (board.active) {
    const piece = board.active,
      matrix = SHAPES[piece.type][piece.rotation];
    const collides = (py: number) =>
      matrix.some((row, y) =>
        row.some(
          (v, x) =>
            v &&
            (piece.x + x < 0 ||
              piece.x + x >= COLS ||
              py + y >= ROWS ||
              (py + y >= 0 && board.board[py + y]?.[piece.x + x] != null)),
        ),
      );
    let ghostY = piece.y;
    while (ghostY < ROWS && !collides(ghostY + 1)) ghostY++;
    active = {
      ...piece,
      ghostY,
      lockTimerMs: 0,
      lockResetsUsed: 0,
      lastActionWasRotation: false,
      lastKickIndex: 0,
    };
  }
  return {
    version: 2,
    mode: "marathon",
    status: board.status,
    seed: 0,
    prngState: 0,
    board: board.board,
    active,
    hold: board.hold,
    holdUsedThisTurn: false,
    bag: [],
    nextQueue: [board.next],
    score: board.score,
    lines: board.lines,
    level: board.level,
    combo: -1,
    backToBack: false,
    elapsedMs: board.elapsedMs,
    gravityTimerMs: 0,
    softDropActive: false,
    piecesPlaced: board.piecesPlaced,
    lastEvent: null,
  };
}

export function startOnline(
  root: HTMLElement,
  settings: () => UserSettings,
  onExit: () => void,
): { destroy(): void; background(): void; back(): void } {
  const overlay = document.createElement("section");
  overlay.className = "online-screen";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "online-title");
  overlay.tabIndex = -1;
  let theme = applyTheme(settings().theme, overlay);
  overlay.classList.toggle("reduce-motion", settings().reducedMotion);
  overlay.innerHTML = `
    <div class="online-inner">
      <header class="online-header"><h2 id="online-title">Online Battle</h2><button type="button" class="online-button online-exit" data-online="exit">Exit</button></header>
      <p class="online-status" role="status" aria-live="polite">Disconnected. Connect to a server to play.</p>
      <p class="online-error" role="alert" hidden></p>
      <section class="online-connection" aria-label="Server connection">
        <label>Server address<input name="onlineEndpoint" type="url" inputmode="url" spellcheck="false" autocomplete="off" placeholder="wss://your-server.example/ws" /></label>
        <label>Your name<input name="onlineName" maxlength="24" autocomplete="nickname" placeholder="Player" /></label>
        <label class="online-lan"><input name="onlineLan" type="checkbox" /> Allow an unencrypted private LAN server</label>
        <p class="online-server-help">Use a secure wss:// server. Connect is always your choice.</p>
        <div class="online-actions"><button type="button" class="online-button online-primary" data-online="connect">Connect</button><button type="button" class="online-button" data-online="disconnect" hidden>Disconnect</button></div>
      </section>
      <section class="online-lobby" aria-label="Create or join a room">
        <p>Two players. Same pieces. Clear lines to send garbage.</p>
        <button type="button" class="online-button online-primary" data-online="create" disabled>Create room</button>
        <div class="online-join"><label>Room code<input name="onlineCode" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC234" /></label><button type="button" class="online-button" data-online="join" disabled>Join</button></div>
      </section>
      <section class="online-room" hidden aria-label="Room lobby"><div class="online-room-heading"><h3>Room <strong class="online-code"></strong></h3><button type="button" class="online-button" data-online="leave">Leave room</button></div>
        <div class="online-players"></div><p class="online-balance-summary"></p>
        <details class="online-balance"><summary>Match balance</summary><p class="online-balance-help"></p><div class="online-balance-fields"></div><button type="button" class="online-button" data-online="reset-balance" hidden>Reset to equal</button></details>
        <button type="button" class="online-button online-primary" data-online="ready">Ready</button>
      </section>
      <section class="online-game" hidden aria-label="Online match">
        <div class="online-match-status" role="status" aria-live="polite"></div>
        <div class="online-stage">
          <div class="online-board"><canvas id="board" aria-label="Your online playfield" role="img"></canvas></div>
          <aside class="online-left"><span>HOLD</span><canvas class="online-hold" aria-label="Held piece"></canvas><dl><dt>LINES</dt><dd class="online-lines">0</dd><dt>SENT</dt><dd class="online-sent">0</dd><dt>INCOMING</dt><dd class="online-incoming">0</dd></dl></aside>
          <aside class="online-right"><span>NEXT</span><canvas class="online-next" aria-label="Next piece"></canvas><span class="online-opponent-name">OPPONENT</span><canvas class="online-opponent" aria-label="Opponent playfield" role="img"></canvas></aside>
          <div class="online-controls"><div class="online-movement-pad"><svg class="online-pad-outline" viewBox="0 0 300 200" preserveAspectRatio="none" aria-hidden="true"><path d="M2 2H298V98H198V198H102V98H2Z"/></svg>${ACTIONS.slice(
            0,
            3,
          )
            .map(
              ([action, icon, label]) =>
                `<button type="button" class="control online-control" data-command="${action}" aria-label="${label}"><span aria-hidden="true">${icon}</span></button>`,
            )
            .join("")}</div>${ACTIONS.slice(3)
            .map(
              ([action, icon, label]) =>
                `<button type="button" class="control online-control" data-command="${action}" aria-label="${label}"><span aria-hidden="true">${icon}</span></button>`,
            )
            .join("")}</div>
        </div>
        <p class="online-battle-balance"></p>
      </section>
      <section class="online-confirm" role="alertdialog" aria-modal="true" aria-labelledby="online-confirm-title" hidden tabindex="-1"><h3 id="online-confirm-title">Forfeit this round?</h3><p>Online matches cannot pause. Leaving ends your round.</p><button type="button" class="online-button online-primary" data-online="forfeit">Forfeit and leave</button><button type="button" class="online-button" data-online="cancel-exit">Keep playing</button></section>
    </div>`;
  root.append(overlay);
  const get = <T extends HTMLElement = HTMLElement>(selector: string) =>
    overlay.querySelector<T>(selector)!;
  const endpoint = get<HTMLInputElement>('[name="onlineEndpoint"]'),
    name = get<HTMLInputElement>('[name="onlineName"]'),
    code = get<HTMLInputElement>('[name="onlineCode"]'),
    lan = get<HTMLInputElement>('[name="onlineLan"]');
  endpoint.value = read(ENDPOINT_KEY) || defaultEndpoint();
  name.value = read(NAME_KEY) || "Player";
  const native = Capacitor.isNativePlatform();
  get<HTMLElement>(".online-lan").hidden = native;
  if (native)
    get(".online-server-help").textContent =
      "Android requires a secure wss:// server. Enter its address, then Connect.";
  let client: OnlineClient | null = null,
    room: RoomView | null = null,
    boards: Record<string, BoardView> = {};
  let disposed = false,
    frame = 0,
    confirming = false,
    backgrounded = false,
    balanceKey = "",
    layoutKey = "",
    boardKey = "";
  let exitAfterConfirm = false;
  const unsubscribers: (() => void)[] = [];
  const painted = new Map<HTMLCanvasElement, string>();
  const boardPixels = new WeakMap<BoardView, string>();
  const error = (value: unknown) => {
    get(".online-error").textContent =
      value instanceof Error ? value.message : String(value);
    get(".online-error").hidden = false;
  };
  const attempt = (action: () => void) => {
    get(".online-error").hidden = true;
    try {
      action();
    } catch (value) {
      error(value);
    }
  };
  const connected = () => client?.status === "connected";
  const started = () =>
    room?.phase === "playing" || room?.phase === "countdown";
  const playable = () =>
    !disposed &&
    connected() &&
    room?.phase === "playing" &&
    !confirming &&
    !document.hidden &&
    !backgrounded;
  function input(command: GameCommand) {
    const release = command.type === "SOFT_DROP" && !command.active;
    if (!(playable() || (release && connected() && started()))) return;
    if (
      command.type === "TICK" ||
      command.type === "PAUSE" ||
      command.type === "RESUME"
    )
      return;
    attempt(() => client!.sendInput(command as OnlineInput));
    if (command.type === "HOLD") controls.pieceChanged();
  }
  const controls = new TouchControls(
    overlay,
    input,
    settings,
    playable,
    (key) => {
      if (key === "back") back();
      else if (started()) {
        get(".online-match-status").textContent =
          "Online matches cannot pause. Exit to forfeit.";
        controls.releaseAll();
      }
    },
  );
  function disconnect() {
    controls.releaseAll();
    unsubscribers.splice(0).forEach((unsubscribe) => unsubscribe());
    client?.close();
    client = null;
    room = null;
    boards = {};
    confirming = false;
    backgrounded = false;
    get(".online-confirm").hidden = true;
    balanceKey = "";
    boardKey = "";
    painted.clear();
    update();
  }
  async function connect() {
    if (client?.status === "connecting" || connected()) return;
    disconnect();
    get(".online-error").hidden = true;
    let attemptClient: OnlineClient | null = null;
    try {
      const address = endpoint.value.trim();
      if (native && !address.startsWith("wss://"))
        throw new Error(
          "Android requires wss://. Use a secure server address and try Connect again.",
        );
      const next = new OnlineClient(address, {
        allowInsecureLocalNetwork: !native && lan.checked,
      });
      attemptClient = next;
      client = next;
      unsubscribers.push(
        next.subscribeStatus((status) => {
          if (disposed || client !== next) return;
          if (status === "disconnected") {
            controls.releaseAll();
            room = null;
            boards = {};
            confirming = false;
            get(".online-confirm").hidden = true;
            get(".online-status").textContent =
              "Connection lost. The round cannot resume. Check the address or network, then Retry.";
          }
          update();
        }),
      );
      unsubscribers.push(
        next.subscribe((message) => {
          if (disposed || client !== next) return;
          if (message.type === "error") {
            error(message.message);
            return;
          }
          if (message.type === "left") {
            room = null;
            boards = {};
            balanceKey = "";
          }
          if (message.type === "room" || message.type === "snapshot") {
            const oldPhase = room?.phase;
            room = message.room;
            if (message.type === "snapshot") {
              boards = message.boards;
              const own = boards[next.playerId!];
              const key = own
                ? `${own.piecesPlaced}:${own.hold}:${own.active?.type}`
                : "";
              if (key !== boardKey) {
                controls.pieceChanged();
                boardKey = key;
              }
            }
            if (room.phase !== "playing") controls.releaseAll();
            if (oldPhase !== room.phase) {
              layoutKey = "";
              backgrounded = false;
            }
          }
          update();
        }),
      );
      await next.connect();
      if (disposed || client !== next) return;
      store(ENDPOINT_KEY, address);
      store(NAME_KEY, name.value.trim());
      update();
    } catch (value) {
      if (!disposed && client === attemptClient) {
        error(value);
        update();
      }
    }
  }
  function update() {
    if (disposed) return;
    const isConnected = connected(),
      connecting = client?.status === "connecting",
      active = started() || room?.phase === "finished";
    endpoint.disabled = isConnected || connecting;
    lan.disabled = endpoint.disabled;
    name.disabled = !!room || connecting;
    get<HTMLButtonElement>('[data-online="connect"]').disabled =
      isConnected || connecting;
    get('[data-online="connect"]').textContent = connecting
      ? "Connecting…"
      : client?.status === "disconnected"
        ? "Retry"
        : "Connect";
    get('[data-online="disconnect"]').hidden = !isConnected && !connecting;
    get(".online-connection").hidden = !!room;
    get(".online-lobby").hidden = !!room;
    for (const action of ["create", "join"])
      get<HTMLButtonElement>(`[data-online="${action}"]`).disabled =
        !isConnected;
    get(".online-room").hidden = !room || !!active;
    get(".online-game").hidden = !active;
    overlay.classList.toggle("online-in-match", !!active);
    if (client?.status !== "disconnected")
      get(".online-status").textContent = isConnected
        ? room
          ? `Room ${room.code} · ${room.mode === "battle" ? "Battle" : "Survival"}`
          : "Connected. Create a room or enter a room code."
        : connecting
          ? "Connecting to server…"
          : "Disconnected. Connect to a server to play.";
    if (!room) return;
    get(".online-code").textContent = room.code;
    const player = room.players.find((p) => p.id === client?.playerId);
    const ready = get<HTMLButtonElement>('[data-online="ready"]');
    ready.disabled = !isConnected || room.phase !== "waiting";
    ready.textContent = player?.ready ? "Not ready" : "Ready";
    get(".online-players").replaceChildren(
      ...room.players.map((p) => {
        const row = document.createElement("p");
        const label = document.createElement("strong");
        label.textContent = `${p.name}${p.id === client?.playerId ? " (you)" : ""}`;
        const status = document.createElement("span");
        status.textContent = p.ready ? "Ready" : "Not ready";
        row.append(label, status);
        return row;
      }),
    );
    const summary = room.players
      .map(
        (p) =>
          `${p.id === client?.playerId ? "You" : p.name}: ${attackLabel(p.balance?.attackLevel ?? 0)} (${attackPercent(p.balance?.attackLevel ?? 0)}%)`,
      )
      .join(" / ");
    get(".online-balance-summary").textContent = summary;
    get(".online-battle-balance").textContent = summary;
    const host = room.hostId === client?.playerId,
      editable = host && room.phase === "waiting" && isConnected;
    get<HTMLButtonElement>('[data-online="reset-balance"]').hidden = !editable;
    get(".online-balance-help").textContent = host
      ? "Outgoing attacks only. Changes reset both players’ readiness."
      : "The host can change outgoing attacks. Changes reset readiness.";
    const key = JSON.stringify([editable, room.players]);
    if (key !== balanceKey) {
      balanceKey = key;
      get(".online-balance-fields").replaceChildren(
        ...room.players.map((p) => {
          const field = document.createElement("fieldset");
          field.disabled = !editable;
          const legend = document.createElement("legend");
          legend.textContent = p.name;
          const label = document.createElement("label");
          label.append("Outgoing attack");
          const select = document.createElement("select");
          select.dataset.player = p.id;
          select.setAttribute("aria-label", `${p.name} outgoing attack`);
          for (const level of ATTACK_LEVELS)
            select.add(
              new Option(
                `${attackLabel(level)} · ${attackPercent(level)}%`,
                String(level),
              ),
            );
          select.value = String(p.balance?.attackLevel ?? 0);
          label.append(select);
          field.append(legend, label);
          return field;
        }),
      );
    }
    if (room.phase === "countdown")
      get(".online-match-status").textContent = "Both ready. Starting…";
    else if (room.phase === "playing")
      get(".online-match-status").textContent = backgrounded
        ? "You left the app. The live round kept running; it cannot pause."
        : "Live round · no pause";
    else if (room.phase === "finished") {
      const result =
        room.winnerId === client?.playerId
          ? "You won"
          : room.winnerId === null
            ? "Draw"
            : "Round lost";
      get(".online-match-status").textContent =
        `${result}${room.resultReason === "disconnect" ? " · player left" : ""}. Leave the room to play again.`;
    }
    const opponent = room.players.find((p) => p.id !== client?.playerId);
    get(".online-opponent-name").textContent = opponent?.name || "OPPONENT";
  }
  function layout() {
    const stage = get(".online-stage"),
      width = stage.clientWidth,
      height = stage.clientHeight;
    if (!width || !height) return;
    const config = settings(),
      key = `${width}:${height}:${JSON.stringify(config)}`;
    if (key === layoutKey) return;
    layoutKey = key;
    painted.clear();
    if (theme.id !== config.theme) theme = applyTheme(config.theme, overlay);
    controls.releaseAll();
    overlay.dataset.layout = config.controlLayout;
    const geometry = computeControlGeometry(
      width,
      height,
      config,
      innerWidth > innerHeight ? "landscape" : "portrait",
    );
    const rect = (node: HTMLElement, value: ControlRect) =>
      Object.assign(node.style, {
        left: `${value.x}px`,
        top: `${value.y}px`,
        width: `${value.width}px`,
        height: `${value.height}px`,
      });
    const board = computeBoardGeometry(
      width,
      height,
      geometry,
      config.controlLayout,
    );
    rect(get(".online-board"), board);
    const rails = computeRailGeometry(
      board,
      height,
      geometry,
      config.controlLayout,
    );
    rect(get(".online-left"), rails.left);
    rect(get(".online-right"), rails.right);
    const pad = get(".online-movement-pad");
    if (geometry.pad) {
      rect(pad, geometry.pad);
      pad.style.setProperty(
        "--control-opacity",
        String(geometry.groupOpacity?.pad ?? config.controlOpacity),
      );
    } else pad.removeAttribute("style");
    for (const [action, , , group] of ACTIONS) {
      const button = get<HTMLButtonElement>(`[data-command="${action}"]`);
      const original = geometry.buttons[action];
      const inPad =
        geometry.pad &&
        ["MOVE_LEFT", "MOVE_RIGHT", "SOFT_DROP"].includes(action);
      rect(
        button,
        inPad
          ? {
              ...original,
              x: original.x - geometry.pad!.x,
              y: original.y - geometry.pad!.y,
            }
          : original,
      );
      button.hidden = !!geometry.groupHidden?.[group];
      button.style.setProperty(
        "--control-opacity",
        String(geometry.groupOpacity?.[group] ?? config.controlOpacity),
      );
    }
  }
  function canvasSize(canvas: HTMLCanvasElement) {
    return `${canvas.clientWidth}:${canvas.clientHeight}:${Math.min(devicePixelRatio || 1, 3)}`;
  }
  function paintBoard(
    canvas: HTMLCanvasElement,
    board: BoardView,
    ghost: boolean,
  ) {
    let pixels = boardPixels.get(board);
    if (pixels === undefined) {
      // Wire snapshots are immutable locally. Clocks, acknowledgments and score do not alter pixels.
      pixels = JSON.stringify([board.board, board.active, board.status]);
      boardPixels.set(board, pixels);
    }
    const key = `${theme.id}:${ghost}:${canvasSize(canvas)}:${pixels}`;
    if (painted.get(canvas) === key) return;
    drawBoard(canvas, snapshot(board), ghost, [], theme);
    painted.set(canvas, key);
  }
  function paintPreview(
    canvas: HTMLCanvasElement,
    type: BoardView["hold"],
    dim = false,
  ) {
    const key = `${type}:${dim}:${theme.id}:${canvasSize(canvas)}`;
    if (painted.get(canvas) === key) return;
    drawPreview(canvas, type, dim, theme);
    painted.set(canvas, key);
  }
  function setMetric(selector: string, value: number) {
    const node = get(selector),
      text = String(value);
    if (node.textContent !== text) node.textContent = text;
  }
  function render() {
    if (disposed) return;
    controls.update(performance.now());
    if (!document.hidden && !get(".online-game").hidden) {
      layout();
      const own = client?.playerId ? boards[client.playerId] : undefined;
      if (own) {
        paintBoard(
          get<HTMLCanvasElement>("#board"),
          own,
          settings().ghostEnabled,
        );
        paintPreview(get<HTMLCanvasElement>(".online-hold"), own.hold);
        paintPreview(get<HTMLCanvasElement>(".online-next"), own.next);
        setMetric(".online-lines", own.lines);
        setMetric(".online-sent", own.sent ?? 0);
        setMetric(".online-incoming", own.incoming ?? 0);
      }
      const other = Object.entries(boards).find(
        ([id]) => id !== client?.playerId,
      )?.[1];
      if (other)
        paintBoard(get<HTMLCanvasElement>(".online-opponent"), other, false);
    }
    frame = requestAnimationFrame(render);
  }
  function requestLeave(exit: boolean) {
    controls.releaseAll();
    if (started() && connected()) {
      exitAfterConfirm = exit;
      confirming = true;
      get(".online-confirm").hidden = false;
      get(".online-confirm").focus();
    } else {
      disconnect();
      if (exit) onExit();
    }
  }
  function back() {
    if (disposed) return;
    if (confirming) {
      confirming = false;
      get(".online-confirm").hidden = true;
      return;
    }
    requestLeave(true);
  }
  function background() {
    if (disposed) return;
    controls.releaseAll();
    if (started()) {
      backgrounded = true;
      get(".online-match-status").textContent =
        "The live round keeps running in the background. Online matches cannot pause.";
    }
  }
  function visibility() {
    if (document.hidden) background();
    else {
      backgrounded = false;
      update();
    }
  }
  function focus() {
    if (!document.hidden && backgrounded) {
      backgrounded = false;
      update();
      if (started())
        get(".online-match-status").textContent =
          "The live round continued while you were away. Online matches cannot pause.";
    }
  }
  function click(event: Event) {
    const action = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-online]",
    )?.dataset.online;
    switch (action) {
      case "connect":
        void connect();
        break;
      case "disconnect":
        requestLeave(false);
        break;
      case "exit":
        back();
        break;
      case "leave":
        requestLeave(false);
        break;
      case "create":
        attempt(() => {
          store(NAME_KEY, name.value.trim());
          client!.createRoom(name.value.trim());
        });
        break;
      case "join":
        attempt(() => {
          store(NAME_KEY, name.value.trim());
          client!.joinRoom(code.value.trim().toUpperCase(), name.value.trim());
        });
        break;
      case "ready":
        attempt(() =>
          client!.setReady(
            !room?.players.find((p) => p.id === client?.playerId)?.ready,
          ),
        );
        break;
      case "reset-balance":
        if (room?.phase === "waiting" && room.hostId === client?.playerId) {
          attempt(() => {
            for (const player of room!.players) {
              if ((player.balance?.attackLevel ?? 0) !== 0)
                client!.setBalance(player.id, { attackLevel: 0 });
            }
          });
        }
        break;
      case "forfeit": {
        const exit = exitAfterConfirm;
        attempt(() => client?.leaveRoom());
        disconnect();
        if (exit) onExit();
        break;
      }
      case "cancel-exit":
        confirming = false;
        get(".online-confirm").hidden = true;
        get<HTMLButtonElement>('[data-online="exit"]').focus();
        break;
    }
  }
  function change(event: Event) {
    const target = event.target as HTMLSelectElement;
    if (target.dataset.player)
      attempt(() =>
        client!.setBalance(target.dataset.player!, {
          attackLevel: Number(target.value),
        }),
      );
  }
  function keydown(event: KeyboardEvent) {
    if ((event.target as HTMLElement).matches("input,select,textarea")) {
      event.stopPropagation();
      if (event.key === "Escape") {
        event.preventDefault();
        back();
      }
    }
    if (event.key !== "Tab") return;
    const scope = confirming ? get(".online-confirm") : overlay;
    const nodes = [
      ...scope.querySelectorAll<HTMLElement>(
        "button:not(:disabled),input:not(:disabled),select:not(:disabled),summary",
      ),
    ].filter((node) => node.getClientRects().length > 0);
    const first = nodes[0],
      last = nodes.at(-1);
    if (
      event.shiftKey &&
      (document.activeElement === first || document.activeElement === scope)
    ) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
  overlay.addEventListener("click", click);
  overlay.addEventListener("change", change);
  overlay.addEventListener("keydown", keydown);
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("blur", background);
  window.addEventListener("focus", focus);
  update();
  overlay.focus();
  frame = requestAnimationFrame(render);
  return {
    background,
    back,
    destroy() {
      if (disposed) return;
      controls.destroy();
      disconnect();
      disposed = true;
      cancelAnimationFrame(frame);
      overlay.removeEventListener("click", click);
      overlay.removeEventListener("change", change);
      overlay.removeEventListener("keydown", keydown);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("blur", background);
      window.removeEventListener("focus", focus);
      overlay.remove();
    },
  };
}
