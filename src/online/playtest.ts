import "./playtest.css";
import { COLS, ROWS, HIDDEN_ROWS, SHAPES } from "../engine/constants";
import type { TetrominoType } from "../contracts/game-contract";
import { OnlineClient } from "./client";
import type { BoardView, OnlineInput, RoomView } from "./protocol";

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing element: ${id}`);
  return value as T;
}
const lobby = element<HTMLFormElement>("lobby");
const roomPanel = element("room");
const name = element<HTMLInputElement>("name");
const code = element<HTMLInputElement>("code");
const ready = element<HTMLButtonElement>("ready");
const retry = element<HTMLButtonElement>("retry");
const error = element("error");
const controls = [
  ...document.querySelectorAll<HTMLButtonElement>("[data-action]"),
];
let room: RoomView | null = null;
let boards: Record<string, BoardView> = {};
const held = new Map<
  string,
  { action: string; timer?: ReturnType<typeof setTimeout> }
>();
const socketUrl = new URL("/ws", location.href);
socketUrl.protocol = location.protocol === "https:" ? "wss:" : "ws:";
const client = new OnlineClient(socketUrl.href, {
  allowInsecureLocalNetwork: true,
});
const colors: Record<TetrominoType, string> = {
  I: "#88beb1",
  O: "#e4d188",
  T: "#d5b9e3",
  S: "#b4edb8",
  Z: "#d99591",
  J: "#a4c9d7",
  L: "#efaa78",
};
code.value =
  new URL(location.href).searchParams.get("room")?.toUpperCase().slice(0, 6) ??
  "";
code.addEventListener("input", () => {
  code.value = code.value.toUpperCase();
});

function showError(value: unknown): void {
  error.textContent = value instanceof Error ? value.message : String(value);
  error.hidden = false;
}
function attempt(action: () => void): void {
  error.hidden = true;
  try {
    action();
  } catch (value) {
    showError(value);
  }
}
function playable(): boolean {
  return client.status === "connected" && room?.phase === "playing";
}
function input(command: OnlineInput): void {
  if (playable()) attempt(() => client.sendInput(command));
}
function update(): void {
  const connected = client.status === "connected";
  lobby.hidden = room !== null;
  roomPanel.hidden = room === null;
  for (const button of lobby.querySelectorAll("button"))
    button.disabled = !connected;
  element<HTMLButtonElement>("leave").disabled = !connected;
  ready.disabled = !connected || room?.phase !== "waiting";
  controls.forEach((button) => {
    button.disabled = !playable();
  });
  if (!room) {
    drawBoard("board");
    drawBoard("opponent");
    drawPreview("hold", null);
    drawPreview("next", null);
    element("score").textContent = "0";
    element("lines").textContent = "0";
    element("opponent-name").textContent = "Opponent";
    element("opponent-score").textContent = "";
    return;
  }
  element("room-code").textContent = room.code;
  element("players").textContent = room.players
    .map(
      (p) =>
        `${p.name}${p.id === client.playerId ? " (you)" : ""}${p.ready ? " ✓" : ""}`,
    )
    .join(" · ");
  const self = room.players.find((p) => p.id === client.playerId);
  ready.textContent = self?.ready ? "Not ready" : "Ready";
  let phase = "Waiting for two ready players";
  if (!connected) phase = "Disconnected. Retry, then join again.";
  else if (room.phase === "countdown")
    phase = `Starting in ${Math.max(1, Math.ceil(((room.startAt ?? Date.now()) - Date.now()) / 1000))}…`;
  else if (room.phase === "playing") phase = "Playing";
  else if (room.phase === "finished") {
    phase =
      room.winnerId === null
        ? "Draw"
        : room.winnerId === client.playerId
          ? "You win"
          : "Opponent wins";
    if (room.resultReason === "disconnect") phase += " · Player disconnected";
    phase += " · Leave to start a new room";
  }
  element("phase").textContent = phase;
  const opponent = room.players.find((p) => p.id !== client.playerId);
  element("opponent-name").textContent = opponent?.name ?? "Opponent";
  const own = boards[client.playerId ?? ""];
  const other = boards[opponent?.id ?? ""];
  element("score").textContent = String(own?.score ?? 0);
  element("lines").textContent = String(own?.lines ?? 0);
  element("opponent-score").textContent = other ? `${other.lines} lines` : "";
  drawBoard("board", own);
  drawBoard("opponent", other);
  drawPreview("hold", own?.hold ?? null);
  drawPreview("next", own?.next ?? null);
}

function tile(
  ctx: CanvasRenderingContext2D,
  type: TetrominoType,
  x: number,
  y: number,
  size: number,
): void {
  ctx.fillStyle = colors[type];
  ctx.fillRect(x + 1, y + 1, size - 2, size - 2);
  ctx.fillStyle = "#ffffff33";
  ctx.fillRect(x + 1, y + 1, size - 2, Math.max(1, size * 0.12));
}
function drawBoard(id: string, view?: BoardView): void {
  const canvas = element<HTMLCanvasElement>(id);
  const ctx = canvas.getContext("2d")!;
  const size = canvas.width / COLS;
  ctx.fillStyle = "#20343b";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#294149";
  ctx.lineWidth = 1;
  for (let x = 1; x < COLS; x++) {
    ctx.beginPath();
    ctx.moveTo(x * size, 0);
    ctx.lineTo(x * size, canvas.height);
    ctx.stroke();
  }
  for (let y = 1; y < ROWS - HIDDEN_ROWS; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * size);
    ctx.lineTo(canvas.width, y * size);
    ctx.stroke();
  }
  if (!view) return;
  view.board.forEach((row, y) =>
    row.forEach((type, x) => {
      if (type && y >= HIDDEN_ROWS)
        tile(ctx, type, x * size, (y - HIDDEN_ROWS) * size, size);
    }),
  );
  const active = view.active;
  if (active)
    SHAPES[active.type][active.rotation].forEach((row, y) =>
      row.forEach((filled, x) => {
        const row = active.y + y - HIDDEN_ROWS;
        if (filled && row >= 0)
          tile(ctx, active.type, (active.x + x) * size, row * size, size);
      }),
    );
}
function drawPreview(id: string, type: TetrominoType | null): void {
  const canvas = element<HTMLCanvasElement>(id);
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!type) return;
  const cells: [number, number][] = [];
  SHAPES[type][0].forEach((row, y) =>
    row.forEach((filled, x) => {
      if (filled) cells.push([x, y]);
    }),
  );
  const minX = Math.min(...cells.map(([x]) => x));
  const minY = Math.min(...cells.map(([, y]) => y));
  const width = Math.max(...cells.map(([x]) => x)) - minX + 1;
  const height = Math.max(...cells.map(([, y]) => y)) - minY + 1;
  const size = 20;
  cells.forEach(([x, y]) =>
    tile(
      ctx,
      type,
      (canvas.width - width * size) / 2 + (x - minX) * size,
      (canvas.height - height * size) / 2 + (y - minY) * size,
      size,
    ),
  );
}

lobby.addEventListener("submit", (event) => {
  event.preventDefault();
  attempt(() => client.joinRoom(code.value.trim(), name.value));
});
element("create").addEventListener("click", () =>
  attempt(() => client.createRoom(name.value)),
);
ready.addEventListener("click", () =>
  attempt(() =>
    client.setReady(
      !room?.players.find((p) => p.id === client.playerId)?.ready,
    ),
  ),
);
element("leave").addEventListener("click", () => {
  releaseAll();
  attempt(() => client.leaveRoom());
});
retry.addEventListener("click", () => {
  room = null;
  boards = {};
  update();
  void connect();
});
async function connect(): Promise<void> {
  error.hidden = true;
  try {
    await client.connect();
  } catch (value) {
    showError(value);
  }
}
client.subscribeStatus((status) => {
  element("connection").textContent =
    status === "connected"
      ? "Connected"
      : status === "connecting"
        ? "Connecting…"
        : "Disconnected";
  retry.hidden = status !== "disconnected";
  if (status !== "connected") releaseAll();
  update();
});
client.subscribe((message) => {
  if (message.type === "error") showError(message.message);
  if (message.type === "left") {
    room = null;
    boards = {};
  }
  if (message.type === "room" || message.type === "snapshot") {
    if (room?.code !== message.room.code) boards = {};
    room = message.room;
  }
  if (message.type === "snapshot") boards = message.boards;
  if (!playable()) releaseAll();
  update();
});

// Each pointer/key owns its action, so releasing one thumb does not release another.
function press(owner: string, action: string): void {
  if (!playable() || held.has(owner)) return;
  const entry: { action: string; timer?: ReturnType<typeof setTimeout> } = {
    action,
  };
  held.set(owner, entry);
  if (action === "SOFT_DROP") {
    input({ type: "SOFT_DROP", active: true });
    return;
  }
  input({ type: action } as OnlineInput);
  if (action === "MOVE_LEFT" || action === "MOVE_RIGHT") {
    const repeat = () => {
      input({ type: action });
      entry.timer = setTimeout(repeat, 50);
    };
    entry.timer = setTimeout(repeat, 150);
  }
}
function release(owner: string): void {
  const entry = held.get(owner);
  if (!entry) return;
  clearTimeout(entry.timer);
  held.delete(owner);
  if (
    entry.action === "SOFT_DROP" &&
    ![...held.values()].some((item) => item.action === "SOFT_DROP")
  )
    input({ type: "SOFT_DROP", active: false });
}
function releaseAll(): void {
  [...held.keys()].forEach(release);
}
controls.forEach((button) => {
  button.addEventListener("pointerdown", (event) => {
    if (button.disabled) return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    press(`pointer-${event.pointerId}`, button.dataset.action!);
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
    button.addEventListener(type, (event) =>
      release(`pointer-${(event as PointerEvent).pointerId}`),
    );
  button.addEventListener("contextmenu", (event) => event.preventDefault());
  // Native keyboard activation of a focused button remains usable.
  button.addEventListener("click", (event) => {
    if (event.detail === 0) {
      press("activation", button.dataset.action!);
      release("activation");
    }
  });
});
const keys: Record<string, string> = {
  ArrowLeft: "MOVE_LEFT",
  ArrowRight: "MOVE_RIGHT",
  ArrowDown: "SOFT_DROP",
  ArrowUp: "ROTATE_CW",
  KeyX: "ROTATE_CW",
  KeyZ: "ROTATE_CCW",
  Space: "HARD_DROP",
  KeyC: "HOLD",
  ShiftLeft: "HOLD",
  ShiftRight: "HOLD",
};
window.addEventListener("keydown", (event) => {
  if (
    event.target instanceof HTMLInputElement ||
    !keys[event.code] ||
    !playable()
  )
    return;
  // Let Space/Enter activate focused buttons through their native click behavior.
  if (event.target instanceof HTMLButtonElement && event.code === "Space")
    return;
  event.preventDefault();
  if (!event.repeat) press(`key-${event.code}`, keys[event.code]);
});
window.addEventListener("keyup", (event) => release(`key-${event.code}`));
window.addEventListener("blur", releaseAll);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) releaseAll();
});
window.addEventListener("pagehide", () => {
  releaseAll();
  client.close();
});
setInterval(() => {
  if (room?.phase === "countdown") update();
}, 100);
update();
void connect();
