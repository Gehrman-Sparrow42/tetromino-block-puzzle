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
import { t, subscribeLanguage } from "../platform/i18n";
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
    {
      title: "Spin into a pocket",
      prompt: "Soft drop, rotate clockwise, hard drop.",
      tip: "Release ↓ before turning. Rotate into the pocket to clear both rows. Three occupied corners make this a T-spin.",
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
    (track === "advanced" && (lesson === 2 || lesson === 3))
      ? "I"
      : "T";
  state.active = { ...state.active!, type, rotation: 0, x: 3, y: 4 };
  if (track === "basics" && lesson === 3) {
    state.board[23] = Array<TetrominoType | null>(10).fill("J");
    for (let x = 3; x < 7; x++) state.board[23]![x] = null;
  }
  if (track === "advanced" && lesson === 1) state.hold = "I";
  if (track === "advanced" && (lesson === 2 || lesson === 3)) {
    for (let y = lesson === 3 ? 16 : 20; y < 24; y++) {
      state.board[y] = Array<TetrominoType | null>(10).fill("J");
      state.board[y]![5] = null;
    }
    state.nextQueue[0] = "I";
  }
  if (track === "advanced" && lesson === 4) {
    // Start above a T-shaped pocket. A real downward move and rotation form a
    // full T-spin double; no rotation history or clear event is pre-awarded.
    state.active.rotation = 1;
    state.active.y = 20;
    state.board[21]![3] = "J";
    state.board[22] = Array.from({ length: 10 }, (_, x) =>
      x >= 3 && x <= 5 ? null : "J",
    );
    state.board[23] = Array.from({ length: 10 }, (_, x) =>
      x === 4 ? null : "J",
    );
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
    track === "basics" ? t("Basics tutorial") : t("Advanced tutorial"),
  );
  overlay.tabIndex = -1;
  overlay.innerHTML = `<div class="tutorial-inner"><header class="tutorial-header"><h1>${t(track === "basics" ? "Basics tutorial" : "Advanced tutorial")}</h1><button class="secondary-button" data-tutorial-exit>${t("Exit tutorial")}</button></header><div class="tutorial-objective"><div class="tutorial-progress"></div><h2></h2><p class="tutorial-prompt"></p><p class="tutorial-tip"></p><p class="tutorial-feedback" role="status" aria-live="polite"></p></div><div class="tutorial-practice"><div class="tutorial-board-wrap"><canvas id="board" aria-label="${t("Practice board")}"></canvas><aside><span>${t("Hold")}</span><canvas class="tutorial-hold" aria-label="${t("Held piece")}"></canvas><span>${t("Next")}</span><canvas class="tutorial-next" aria-label="${t("Next piece")}"></canvas></aside></div><div class="tutorial-controls" aria-label="${t("Practice controls")}">${[
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
        `<button type="button" data-command="${command}" aria-label="${t(label!)}">${t(text!)}</button>`,
    )
    .join(
      "",
    )}</div></div><footer class="tutorial-footer"><button class="secondary-button" data-reset>${t("Reset lesson")}</button><button class="primary-button" data-continue disabled>${t("Continue")}</button><button class="primary-button" data-resume hidden>${t("Resume practice")}</button></footer></div>`;
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
  let unsubscribeLanguage = () => {};
  function refreshLanguage() {
    const title = t(
      track === "basics" ? "Basics tutorial" : "Advanced tutorial",
    );
    overlay.setAttribute("aria-label", title);
    find("h1").textContent = title;
    find("[data-tutorial-exit]").textContent = t("Exit tutorial");
    find("[data-reset]").textContent = t("Reset lesson");
    find("[data-resume]").textContent = t("Resume practice");
    continueButton.textContent = t(finished ? "Replay tutorial" : "Continue");
    for (const [selector, label] of [
      ["#board", "Practice board"],
      [".tutorial-hold", "Held piece"],
      [".tutorial-next", "Next piece"],
      [".tutorial-controls", "Practice controls"],
    ]) {
      find(selector!).setAttribute("aria-label", t(label!));
    }
    const sideLabels = overlay.querySelectorAll("aside span");
    sideLabels[0]!.textContent = t("Hold");
    sideLabels[1]!.textContent = t("Next");
    for (const [action, label, text] of [
      ["MOVE_LEFT", "Move left", "←"],
      ["SOFT_DROP", "Soft drop", "↓"],
      ["MOVE_RIGHT", "Move right", "→"],
      ["ROTATE_CCW", "Rotate counterclockwise", "↶"],
      ["ROTATE_CW", "Rotate clockwise", "↷"],
      ["HARD_DROP", "Hard drop", "Drop"],
      ["HOLD", "Hold", "Hold"],
    ]) {
      const button = find(`[data-command="${action}"]`);
      button.setAttribute("aria-label", t(label!));
      button.textContent = t(text!);
    }
    find(".tutorial-progress").textContent = t("Lesson {count} of {total}", {
      count: Math.min(lesson + 1, LESSONS[track].length),
      total: LESSONS[track].length,
    });
    if (finished) {
      find("h2").textContent = t("Practice complete");
      find(".tutorial-prompt").textContent = t(
        track === "basics"
          ? "You have moved, rotated, dropped, cleared a line and used Hold."
          : "You have practiced landing, Hold swaps, Tetrises, back-to-back clears and a T-spin double.",
      );
      find(".tutorial-tip").textContent = t(
        "Replay whenever you like, or exit to choose a game.",
      );
    } else {
      const data = LESSONS[track][lesson]!;
      find("h2").textContent = t(data.title);
      find(".tutorial-prompt").textContent = t(data.prompt);
      find(".tutorial-tip").textContent = t(data.tip);
    }
    find(".tutorial-feedback").textContent = finished
      ? ""
      : paused
        ? t("Practice paused. Resume when you are ready.")
        : complete
          ? t("Goal reached. Continue when you are ready.")
          : state.status === "gameover"
            ? t("Try again with Reset lesson.")
            : "";
  }
  function render() {
    const theme = getTheme(settings().theme);
    drawBoard(board, state, true, [], theme);
    drawPreview(held, state.hold, state.holdUsedThisTurn, theme);
    drawPreview(next, state.nextQueue[0]!, false, theme);
    overlay.dataset.lines = String(state.lines);
    overlay.dataset.pieces = String(state.piecesPlaced);
    overlay.dataset.backToBack = String(state.lastEvent?.backToBack ?? false);
    overlay.dataset.tSpin = state.lastEvent?.tSpin ?? "none";
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
        state.lastEvent?.tSpin === "full" && state.lastEvent.linesCleared === 2,
      ][lesson]!;
    if (state.piecesPlaced > 0 && action.type === "HARD_DROP")
      controls.pieceChanged();
    continueButton.disabled = !complete;
    find(".tutorial-feedback").textContent = complete
      ? t("Goal reached. Continue when you are ready.")
      : state.status === "gameover"
        ? t("Try again with Reset lesson.")
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
    find(".tutorial-progress").textContent = t("Lesson {count} of {total}", {
      count: lesson + 1,
      total: LESSONS[track].length,
    });
    find("h2").textContent = t(data.title);
    find(".tutorial-prompt").textContent = t(data.prompt);
    find(".tutorial-tip").textContent = t(data.tip);
    find(".tutorial-feedback").textContent = "";
    continueButton.textContent = t("Continue");
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
    find(".tutorial-feedback").textContent = t(
      "Practice paused. Resume when you are ready.",
    );
  }
  function destroy() {
    if (disposed) return;
    disposed = true;
    unsubscribeLanguage();
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
      ? t("Goal reached. Continue when you are ready.")
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
      find("h2").textContent = t("Practice complete");
      find(".tutorial-prompt").textContent =
        track === "basics"
          ? t("You have moved, rotated, dropped, cleared a line and used Hold.")
          : t(
              "You have practiced landing, Hold swaps, Tetrises, back-to-back clears and a T-spin double.",
            );
      find(".tutorial-tip").textContent = t(
        "Replay whenever you like, or exit to choose a game.",
      );
      find(".tutorial-feedback").textContent = "";
      find<HTMLButtonElement>("[data-reset]").hidden = true;
      continueButton.textContent = t("Replay tutorial");
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
  unsubscribeLanguage = subscribeLanguage(refreshLanguage);
  frame = requestAnimationFrame(animate);
  return { destroy, pause };
}
