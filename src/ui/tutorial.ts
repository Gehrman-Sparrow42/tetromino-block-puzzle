import type {
  GameCommand,
  GameStateSnapshot,
  TetrominoType,
  UserSettings,
} from "../contracts/game-contract";
import { applyCommand, createInitialState } from "../engine/engine";
import { SHAPES } from "../engine/constants";
import { drawBoard, drawPreview } from "./canvas-renderer";
import { getTheme } from "./themes";
import { TouchControls } from "./touch-controls";
import "./tutorial.css";

export type TutorialTrack = "basics" | "advanced";
export interface TutorialHandle {
  destroy(): void;
  pause(): void;
}
interface Lesson {
  title: string;
  prompt: string;
  tip: string;
}
const LESSONS: Record<TutorialTrack, Lesson[]> = {
  basics: [
    {
      title: "Move your piece",
      prompt: "Move left, then move right.",
      tip: "Use the arrow buttons or ← and → keys. There is no gravity in this practice.",
    },
    {
      title: "Turn a piece",
      prompt: "Rotate the T piece once in either direction.",
      tip: "Use the rotation buttons, ↑ or X clockwise, or Z counterclockwise.",
    },
    {
      title: "Choose your drop",
      prompt: "Soft drop at least one cell, then hard drop to lock the piece.",
      tip: "↓ lowers a piece while held. Hard drop (Space) sends it to the ghost and locks immediately.",
    },
    {
      title: "Clear a line",
      prompt: "Hard drop the horizontal I into the four-cell gap.",
      tip: "A completely filled row disappears. This prepared row needs all four cells of the I.",
    },
    {
      title: "Keep a piece",
      prompt: "Press Hold to store the T piece.",
      tip: "Hold (C or Shift) saves your piece and brings in the next one. The preview shows your saved piece.",
    },
  ],
  advanced: [
    {
      title: "Read the landing",
      prompt:
        "Move right twice, then hard drop with the piece at that position.",
      tip: "The outlined ghost shows the landing at your current position. Hard drop locks at that outline.",
    },
    {
      title: "Swap with Hold",
      prompt: "Hold to swap T for I, try Hold again, then hard drop.",
      tip: "The second Hold cannot swap again: you may hold once per piece. Locking a piece makes Hold available again.",
    },
    {
      title: "Make a Tetris",
      prompt: "Rotate the I clockwise, then hard drop into the narrow well.",
      tip: "The vertical I fills four rows at once. Clearing four rows in one lock is a Tetris.",
    },
    {
      title: "Back-to-back clears",
      prompt:
        "Rotate clockwise and hard drop each of the two I pieces into the well.",
      tip: "Two Tetrises in succession earn a back-to-back bonus. This eight-row setup supplies two I pieces.",
    },
  ],
};

/** Practice fixtures are ordinary valid engine snapshots, never persisted runs. */
export function createTutorialState(
  track: TutorialTrack,
  lesson: number,
): GameStateSnapshot {
  const state = createInitialState("marathon", 71400 + lesson);
  const type: TetrominoType =
    (track === "basics" && lesson === 3) ||
    (track === "advanced" && lesson >= 2)
      ? "I"
      : "T";
  state.active = { ...state.active!, type, rotation: 0, x: 3, y: 4 };
  if (track === "basics" && lesson === 3) {
    state.board[23] = Array<TetrominoType | null>(10).fill("J");
    for (let x = 3; x < 7; x++) state.board[23]![x] = null;
  }
  if (track === "advanced" && lesson === 1) state.hold = "I";
  if (track === "advanced" && lesson >= 2) {
    for (let y = lesson === 3 ? 16 : 20; y < 24; y++) {
      state.board[y] = Array<TetrominoType | null>(10).fill("J");
      state.board[y]![5] = null;
    }
    state.nextQueue[0] = "I";
  }
  const piece = state.active;
  let ghost = piece.y;
  const fits = (py: number) =>
    SHAPES[piece.type][piece.rotation].every((row, y) =>
      row.every(
        (cell, x) =>
          !cell || (py + y < 24 && !state.board[py + y]![piece.x + x]),
      ),
    );
  while (fits(ghost + 1)) ghost++;
  piece.ghostY = ghost;
  return state;
}

export function startTutorial(
  root: HTMLElement,
  track: TutorialTrack,
  settings: () => UserSettings,
  onExit: () => void,
): TutorialHandle {
  const overlay = document.createElement("section");
  overlay.className = "tutorial";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute(
    "aria-label",
    track === "basics" ? "Basics tutorial" : "Advanced tutorial",
  );
  overlay.tabIndex = -1;
  overlay.innerHTML = `<div class="tutorial-inner"><header class="tutorial-header"><h1>${track === "basics" ? "Basics" : "Advanced"} tutorial</h1><button class="secondary-button" data-tutorial-exit>Exit tutorial</button></header><div class="tutorial-objective"><div class="tutorial-progress"></div><h2></h2><p class="tutorial-prompt"></p><p class="tutorial-tip"></p><p class="tutorial-feedback" role="status" aria-live="polite"></p></div><div class="tutorial-practice"><div class="tutorial-board-wrap"><canvas id="board" aria-label="Practice board"></canvas><aside><span>Hold</span><canvas class="tutorial-hold" aria-label="Held piece"></canvas><span>Next</span><canvas class="tutorial-next" aria-label="Next piece"></canvas></aside></div><div class="tutorial-controls" aria-label="Practice controls">${[
    ["MOVE_LEFT", "Move left", "←"],
    ["SOFT_DROP", "Soft drop", "↓"],
    ["MOVE_RIGHT", "Move right", "→"],
    ["ROTATE_CCW", "Rotate counterclockwise", "↶"],
    ["ROTATE_CW", "Rotate clockwise", "↷"],
    ["HARD_DROP", "Hard drop", "Drop"],
    ["HOLD", "Hold", "Hold"],
  ]
    .map(
      ([command, label, text]) =>
        `<button type="button" data-command="${command}" aria-label="${label}">${text}</button>`,
    )
    .join(
      "",
    )}</div></div><footer class="tutorial-footer"><button class="secondary-button" data-reset>Reset lesson</button><button class="primary-button" data-continue disabled>Continue</button><button class="primary-button" data-resume hidden>Resume practice</button></footer></div>`;
  root.append(overlay);
  const find = <T extends HTMLElement>(selector: string) =>
    overlay.querySelector<T>(selector)!;
  const board = find<HTMLCanvasElement>("#board"),
    held = find<HTMLCanvasElement>(".tutorial-hold"),
    next = find<HTMLCanvasElement>(".tutorial-next");
  const continueButton = find<HTMLButtonElement>("[data-continue]");
  let lesson = 0,
    state = createTutorialState(track, 0),
    disposed = false,
    paused = false,
    complete = false,
    finished = false;
  let movedLeft = false,
    movedRight = false,
    softened = false,
    swapped = false,
    blockedHold = false;
  let frame = 0,
    previous = performance.now();
  function render() {
    const theme = getTheme(settings().theme);
    drawBoard(board, state, true, [], theme);
    drawPreview(held, state.hold, state.holdUsedThisTurn, theme);
    drawPreview(next, state.nextQueue[0]!, false, theme);
    overlay.dataset.lines = String(state.lines);
    overlay.dataset.pieces = String(state.piecesPlaced);
    overlay.dataset.backToBack = String(state.lastEvent?.backToBack ?? false);
  }
  function command(action: GameCommand) {
    if (disposed || paused || complete || finished) return;
    const oldX = state.active?.x,
      oldY = state.active?.y,
      oldRotation = state.active?.rotation,
      oldHold = state.hold,
      alreadyHeld = state.holdUsedThisTurn;
    applyCommand(state, action);
    if (action.type === "MOVE_LEFT" && state.active?.x !== oldX)
      movedLeft = true;
    if (action.type === "MOVE_RIGHT" && state.active?.x !== oldX)
      movedRight = true;
    if (action.type === "SOFT_DROP" && action.active) {
      // A deliberate soft-drop press always advances at least one cell, including AT clicks.
      applyCommand(state, { type: "TICK", dtMs: 50 });
      softened ||= state.active?.y !== oldY;
    }
    if (action.type === "HOLD" && !alreadyHeld && state.hold !== oldHold)
      swapped = true;
    if (action.type === "HOLD" && alreadyHeld && state.hold === oldHold)
      blockedHold = true;
    if (track === "basics")
      complete = [
        movedLeft && movedRight,
        (action.type === "ROTATE_CW" || action.type === "ROTATE_CCW") &&
          oldRotation !== state.active?.rotation,
        softened && state.piecesPlaced > 0,
        state.lines >= 1,
        swapped,
      ][lesson]!;
    else
      complete = [
        action.type === "HARD_DROP" && oldX === 5 && movedRight,
        swapped && blockedHold && state.piecesPlaced > 0,
        state.lastEvent?.linesCleared === 4,
        state.lines >= 8 && state.lastEvent?.backToBack === true,
      ][lesson]!;
    if (state.piecesPlaced > 0 && action.type === "HARD_DROP")
      controls.pieceChanged();
    continueButton.disabled = !complete;
    find(".tutorial-feedback").textContent = complete
      ? "Goal reached. Continue when you are ready."
      : state.status === "gameover"
        ? "Try again with Reset lesson."
        : "";
    render();
  }
  const controls = new TouchControls(
    overlay,
    command,
    settings,
    () => !disposed && !paused && !complete && !finished,
    (key) => {
      if (key === "back") exit();
      else pause();
    },
  );
  function loadLesson() {
    controls.releaseAll();
    state = createTutorialState(track, lesson);
    movedLeft =
      movedRight =
      softened =
      swapped =
      blockedHold =
      complete =
      paused =
      finished =
        false;
    overlay.dataset.lesson = String(lesson + 1);
    const data = LESSONS[track][lesson]!;
    find(".tutorial-progress").textContent =
      `Lesson ${lesson + 1} of ${LESSONS[track].length}`;
    find("h2").textContent = data.title;
    find(".tutorial-prompt").textContent = data.prompt;
    find(".tutorial-tip").textContent = data.tip;
    find(".tutorial-feedback").textContent = "";
    continueButton.textContent = "Continue";
    continueButton.disabled = true;
    find<HTMLButtonElement>("[data-reset]").hidden = false;
    find<HTMLButtonElement>("[data-resume]").hidden = true;
    overlay.focus();
    render();
  }
  function pause() {
    if (disposed || finished) return;
    controls.releaseAll();
    paused = true;
    find<HTMLButtonElement>("[data-resume]").hidden = false;
    find(".tutorial-feedback").textContent =
      "Practice paused. Resume when you are ready.";
  }
  function destroy() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    controls.destroy();
    window.removeEventListener("blur", pause);
    document.removeEventListener("visibilitychange", visibility);
    overlay.remove();
  }
  function exit() {
    if (disposed) return;
    destroy();
    onExit();
  }
  function visibility() {
    if (document.hidden) pause();
  }
  find("[data-tutorial-exit]").onclick = exit;
  find("[data-reset]").onclick = loadLesson;
  find("[data-resume]").onclick = () => {
    paused = false;
    find<HTMLButtonElement>("[data-resume]").hidden = true;
    find(".tutorial-feedback").textContent = complete
      ? "Goal reached. Continue when you are ready."
      : "";
    overlay.focus();
  };
  continueButton.onclick = () => {
    if (finished) {
      lesson = 0;
      loadLesson();
      return;
    }
    if (!complete || paused) return;
    if (++lesson < LESSONS[track].length) loadLesson();
    else {
      finished = true;
      controls.releaseAll();
      find("h2").textContent = "Practice complete";
      find(".tutorial-prompt").textContent =
        track === "basics"
          ? "You have moved, rotated, dropped, cleared a line and used Hold."
          : "You have practiced landing, Hold swaps, Tetrises and back-to-back clears.";
      find(".tutorial-tip").textContent =
        "Replay whenever you like, or exit to choose a game.";
      find(".tutorial-feedback").textContent = "";
      find<HTMLButtonElement>("[data-reset]").hidden = true;
      continueButton.textContent = "Replay tutorial";
    }
  };
  window.addEventListener("blur", pause);
  document.addEventListener("visibilitychange", visibility);
  function animate(now: number) {
    if (disposed) return;
    controls.update(now);
    if (!paused && !complete && state.softDropActive)
      command({ type: "TICK", dtMs: Math.min(50, now - previous) });
    previous = now;
    frame = requestAnimationFrame(animate);
  }
  loadLesson();
  frame = requestAnimationFrame(animate);
  return { destroy, pause };
}
