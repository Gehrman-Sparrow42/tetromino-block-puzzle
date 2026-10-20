import type {
  GameCommand,
  GameMode,
  PersonalBestStats,
} from "../contracts/game-contract";
import { createInitialState, applyCommand } from "../engine/engine";
import {
  loadSettings,
  saveSettings,
  loadStats,
  recordResult,
  loadRun,
  saveRun,
  clearRun,
} from "../platform/storage";
import { playSound } from "../platform/audio";
import { pulseHaptic } from "../platform/haptics";
import { setupLifecycle, exitApp } from "../platform/lifecycle";
import { drawBoard, drawPreview } from "./canvas-renderer";
import { TouchControls } from "./touch-controls";

const MODE_NAMES: Record<GameMode, string> = {
  marathon: "Marathon",
  sprint40: "Sprint 40",
  ultra120: "Ultra 120",
};
const num = (value: number) => value.toLocaleString("en-US");
export function formatTime(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}
const control = (command: string, icon: string, label: string, cls = "") =>
  `<button class="control ${cls}" data-command="${command}" aria-label="${label}"><span aria-hidden="true">${icon}</span><small>${label}</small></button>`;

export function startApp(root: HTMLDivElement) {
  let settings = loadSettings(),
    stats = loadStats(),
    state = loadRun();
  let screen: "home" | "game" = "home",
    modal = "",
    previous = 0,
    lastSave = 0,
    recorded = false;
  let feedbackUntil = 0,
    flashRows: number[] = [],
    pendingMode: GameMode = "marathon";
  root.innerHTML = `
    <main class="shell">
      <section id="home" class="home-screen" aria-label="Main menu">
        <header class="home-top"><span class="eyebrow">OFFLINE ARCADE / 01</span><button class="icon-button" data-action="settings" aria-label="Settings">☷</button></header>
        <div class="brand"><div class="brand-symbol" aria-hidden="true"><i></i><i></i><i></i><i></i></div><h1>AFTER<br><span>BLOCK</span></h1><p>TETROMINO · FIND YOUR FLOW</p></div>
        <div class="home-intro"><h2>One more piece.</h2><span>Pure play. Your pace.</span></div>
        <button id="resume-card" class="resume-card" data-action="resume"><span><small>RIGHT WHERE YOU LEFT OFF</small><strong>Continue your run</strong><em id="resume-detail"></em></span><b>↗</b></button>
        <div class="mode-list" aria-label="Choose a game mode">
          <button class="mode-card" data-mode="marathon"><span class="mode-index">01</span><span><strong>Marathon</strong><small>Settle in. Clear lines. Go further.</small></span><span class="mode-glyph">∞</span></button>
          <button class="mode-card" data-mode="sprint40"><span class="mode-index">02</span><span><strong>Sprint 40</strong><small>Forty lines. Race your best time.</small></span><span class="mode-glyph">↗</span></button>
          <button class="mode-card" data-mode="ultra120"><span class="mode-index">03</span><span><strong>Ultra 120</strong><small>Two minutes. Make every piece count.</small></span><span class="mode-glyph">◷</span></button>
        </div>
        <div class="home-links"><button data-action="records">Personal records <span>↗</span></button><button data-action="help">How to play <span>↗</span></button></div>
        <footer class="home-footer"><span>NO ADS. NO DISTRACTIONS.</span><span>JUST BLOCKS.</span></footer>
      </section>
      <section id="game" class="game-screen" hidden aria-label="Game">
        <header class="game-top"><button class="wordmark" data-action="pause" aria-label="Pause game">AFTERBLOCK<span id="mode-label">MARATHON</span></button><button class="icon-button pause-button" data-action="pause" aria-label="Pause game">Ⅱ</button></header>
        <div class="scoreboard"><div class="primary-score"><span>SCORE</span><strong id="score">0</strong></div><div><span>LINES</span><strong id="lines">0</strong></div><div><span>LEVEL</span><strong id="level">1</strong></div><div><span id="time-label">TIME</span><strong id="time">00:00</strong></div></div>
        <div class="playfield">
          <aside class="left-rail"><button class="hold-panel" data-command="HOLD" aria-label="Hold piece"><span class="rail-label">HOLD <small>C</small></span><canvas id="hold" aria-hidden="true"></canvas></button><div class="rail-bottom"><span id="goal">ENDLESS<br>POSSIBILITY</span><div class="vertical-rule"></div><span class="tiny-word">KEEP<br>YOUR<br>FLOW.</span></div></aside>
          <div class="board-wrap"><canvas id="board" role="img" aria-label="Tetromino playfield, ten columns and twenty rows"></canvas><div class="board-corners" aria-hidden="true"></div><div id="feedback" class="feedback" aria-live="polite"></div></div>
          <aside class="next-rail"><span class="rail-label">NEXT</span>${Array.from({ length: 5 }, (_, i) => `<canvas class="next-piece" id="next-${i}" aria-label="Upcoming piece ${i + 1}"></canvas>`).join("")}<span class="queue-foot">PLAN<br>AHEAD.</span></aside>
        </div>
        <div class="lock-row"><span>LOCK</span><div class="lock-track"><i id="lock-meter"></i></div><span id="piece-count">0 PIECES</span></div>
        <div class="control-deck" aria-label="Game controls">
          <div class="movement-cluster">${control("MOVE_LEFT", "←", "Left")}${control("SOFT_DROP", "↓", "Soft drop")}${control("MOVE_RIGHT", "→", "Right")}</div>
          <div class="rotation-cluster">${control("ROTATE_CCW", "↶", "Rotate left")}${control("ROTATE_CW", "↷", "Rotate right")}${control("HOLD", "⇄", "Hold")}</div>
          ${control("HARD_DROP", "↓", "Hard drop", "hard-drop")}
        </div>
        <div class="keyboard-hint">← ↓ → MOVE <span>Z / X ROTATE</span> C HOLD <span>SPACE DROP</span></div>
      </section>
    </main>
    <div id="modal-layer" class="modal-layer" hidden><section id="dialog" class="sheet" role="dialog" aria-modal="true" aria-labelledby="dialog-title" tabindex="-1"></section></div>
    <div id="storage-notice" class="storage-notice" role="status" hidden>Storage unavailable. This run stays in memory.</div>`;
  const el = <T extends HTMLElement = HTMLElement>(id: string) =>
    root.querySelector<T>(`#${id}`)!;
  const dialog = el("dialog"),
    layer = el("modal-layer"),
    canvas = el<HTMLCanvasElement>("board");
  let lastFocus: HTMLElement | null = null;
  const applySettings = () => {
    root.classList.toggle("reduce-motion", settings.reducedMotion);
  };
  applySettings();
  function persist() {
    if (
      state &&
      ["playing", "paused"].includes(state.status) &&
      !saveRun(state)
    )
      el("storage-notice").hidden = false;
  }
  function home() {
    controls.releaseAll();
    screen = "home";
    closeModal();
    el("home").hidden = false;
    el("game").hidden = true;
    updateResume();
  }
  function updateResume() {
    const available = !!state && ["playing", "paused"].includes(state.status);
    el("resume-card").hidden = !available;
    if (state)
      el("resume-detail").textContent =
        `${MODE_NAMES[state.mode]} · ${num(state.score)} points · ${state.lines} lines`;
  }
  function showModal(type: string, content: string) {
    controls.releaseAll();
    lastFocus = document.activeElement as HTMLElement;
    modal = type;
    layer.hidden = false;
    dialog.innerHTML = content;
    dialog.scrollTop = 0;
    dialog.focus();
  }
  function closeModal() {
    modal = "";
    layer.hidden = true;
    dialog.innerHTML = "";
    if (lastFocus?.isConnected) lastFocus.focus({ preventScroll: true });
  }
  const sheetHead = (eyebrow: string, title: string, close = true) =>
    `<div class="sheet-top"><span class="eyebrow">${eyebrow}</span>${close ? '<button class="icon-button" data-action="close" aria-label="Close dialog">×</button>' : ""}</div><h2 id="dialog-title">${title}</h2>`;
  function pause() {
    if (
      screen !== "game" ||
      !state ||
      !["playing", "paused"].includes(state.status)
    )
      return;
    controls.releaseAll();
    applyCommand(state, { type: "PAUSE" });
    persist();
    showModal(
      "pause",
      `${sheetHead("A LITTLE BREATHING ROOM", "On pause.", false)}<p>Your next move can wait. This run is saved.</p><div class="sheet-stats"><span>SCORE<strong>${num(state.score)}</strong></span><span>LINES<strong>${state.lines}</strong></span><span>TIME<strong>${formatTime(state.elapsedMs)}</strong></span></div><button class="primary-button" data-action="resume">Keep playing <span>→</span></button><button class="secondary-button" data-action="settings">Settings</button><div class="split-actions"><button data-action="restart">Restart run</button><button data-action="home">Main menu</button></div>`,
    );
  }
  function resume() {
    if (!state || !["playing", "paused"].includes(state.status)) return;
    screen = "game";
    closeModal();
    el("home").hidden = true;
    el("game").hidden = false;
    applyCommand(state, { type: "RESUME" });
    previous = performance.now();
    root
      .querySelectorAll<HTMLButtonElement>("button")
      .forEach((button) => button.blur());
    draw();
  }
  function newRun(mode: GameMode) {
    state = createInitialState(
      mode,
      crypto.getRandomValues(new Uint32Array(1))[0],
    );
    recorded = false;
    feedbackUntil = 0;
    flashRows = [];
    clearRun();
    persist();
    resume();
  }
  function requestRun(mode: GameMode) {
    pendingMode = mode;
    if (state && ["playing", "paused"].includes(state.status)) {
      if (state.status === "playing") {
        controls.releaseAll();
        applyCommand(state, { type: "PAUSE" });
        persist();
      }
      showModal(
        "confirm",
        `${sheetHead("A FRESH START", "Replace this run?")}<p>Your saved ${MODE_NAMES[state.mode]} run will be replaced. Your personal records stay with you.</p><button class="primary-button" data-action="confirm-new">Start ${MODE_NAMES[mode]} <span>→</span></button><button class="secondary-button" data-action="close">Keep current run</button>`,
      );
    } else newRun(mode);
  }
  function showSettings() {
    if (state?.status === "playing") {
      applyCommand(state, { type: "PAUSE" });
      persist();
    }
    const toggle = (
      key: string,
      title: string,
      detail: string,
      value: boolean,
    ) =>
      `<label class="setting-row"><span><strong>${title}</strong><small>${detail}</small></span><input type="checkbox" name="${key}" ${value ? "checked" : ""}/><i class="switch" aria-hidden="true"></i></label>`;
    showModal(
      "settings",
      `${sheetHead("MAKE IT YOURS", "Your setup.")}<form id="settings-form">${toggle("soundEnabled", "Sound", "Soft, procedural arcade tones", settings.soundEnabled)}<label class="setting-row range-row"><span><strong>Volume</strong><small>Quiet or a little louder</small></span><input name="soundVolume" type="range" min="0" max="1" step=".05" value="${settings.soundVolume}" aria-label="Sound volume"/></label>${toggle("hapticsEnabled", "Haptics", "A little feedback on supported devices", settings.hapticsEnabled)}${toggle("ghostEnabled", "Landing guide", "Preview where your piece will land", settings.ghostEnabled)}${toggle("reducedMotion", "Reduced motion", "Keep visual feedback still", settings.reducedMotion)}<label class="setting-row select-row"><span><strong>Touch controls</strong><small>Buttons always stay available</small></span><select name="controlScheme" aria-label="Touch control scheme"><option value="buttons" ${settings.controlScheme === "buttons" ? "selected" : ""}>Buttons</option><option value="hybrid" ${settings.controlScheme === "hybrid" ? "selected" : ""}>Buttons + swipes</option></select></label><label class="setting-row range-row"><span><strong>Move delay</strong><small>Hold before repeating · milliseconds</small></span><input name="dasMs" type="range" min="80" max="250" step="5" value="${settings.dasMs}" aria-label="Move repeat delay"/></label><label class="setting-row range-row"><span><strong>Repeat speed</strong><small>Lower is faster · milliseconds</small></span><input name="arrMs" type="range" min="16" max="80" step="1" value="${settings.arrMs}" aria-label="Move repeat interval"/></label></form><button class="primary-button" data-action="close">All set <span>✓</span></button>`,
    );
  }
  function showRecords(current: PersonalBestStats) {
    showModal(
      "records",
      `${sheetHead("YOUR OWN HIGH WATER MARK", "Personal bests.")}<div class="record"><span>Marathon / score</span><strong>${num(current.marathonHighScore)}</strong></div><div class="record"><span>Marathon / lines</span><strong>${num(current.marathonMaxLines)}</strong></div><div class="record"><span>Sprint 40 / fastest</span><strong>${current.sprint40BestTimeMs === null ? "—" : formatTime(current.sprint40BestTimeMs)}</strong></div><div class="record"><span>Ultra 120 / score</span><strong>${num(current.ultra120HighScore)}</strong></div><p class="record-note">${num(current.gamesPlayed)} completed runs. Stored on this device.</p><button class="primary-button" data-action="close">Back to it <span>→</span></button>`,
    );
  }
  function help() {
    showModal(
      "help",
      `${sheetHead("A FEW SIMPLE MOVES", "Find your flow.")}<div class="help-copy"><p>Fit the falling pieces together. Fill a horizontal row to clear it and make room for more.</p><h3>Move, turn, commit.</h3><p>Use ← / → to move. Hold ↓ for a soft drop. Rotate with ↶ / ↷. Hard drop places a piece instantly at its landing guide.</p><h3>Think one piece ahead.</h3><p>Hold swaps your current piece once per turn. The NEXT rail shows your next five pieces. Every seven-piece bag includes each shape once.</p><h3>Make it count.</h3><p>Clear four rows together for a four-line clear. Consecutive clears build combos. T-spins and back-to-back difficult clears earn extra points. Speed increases every ten Marathon lines.</p><h3>Three ways to play.</h3><p>Marathon goes until your stack reaches the top. Sprint ends at 40 lines. Ultra gives you 120 seconds to score.</p><h3>Keyboard & gestures.</h3><p>Arrow keys move · Z / X rotate · C or Shift holds · Space drops · P / Escape pauses. Enable swipes in Settings: tap to rotate, swipe sideways to move, down to hard drop, up to hold.</p><p>The game pauses when you leave the app. Return whenever you're ready.</p></div><button class="primary-button" data-action="close">Got it <span>→</span></button>`,
    );
  }
  function terminal() {
    if (!state || recorded) return;
    recorded = true;
    controls.releaseAll();
    stats = recordResult(state);
    clearRun();
    playSound("over", settings);
    const won = state.status === "victory";
    showModal(
      "result",
      `${sheetHead(won ? "NICELY PLAYED" : "THERE IS ALWAYS ANOTHER PIECE", won ? "You did that." : "A good run.", false)}<p>${MODE_NAMES[state.mode]} ${won ? "complete." : "finished."} Take a breath. Then go again.</p><div class="result-score">${num(state.score)}<span>POINTS</span></div><div class="sheet-stats"><span>LINES<strong>${state.lines}</strong></span><span>LEVEL<strong>${state.level}</strong></span><span>TIME<strong>${formatTime(state.elapsedMs)}</strong></span></div><button class="primary-button" data-action="restart">Play again <span>↻</span></button><button class="secondary-button" data-action="home">Main menu</button>`,
    );
  }
  function send(command: GameCommand) {
    if (!state || screen !== "game") return;
    if (state.status !== "playing" && command.type !== "SOFT_DROP") return;
    const locked = state.piecesPlaced,
      level = state.level;
    applyCommand(state, command);
    if (command.type === "ROTATE_CW" || command.type === "ROTATE_CCW")
      playSound("rotate", settings);
    if (command.type === "MOVE_LEFT" || command.type === "MOVE_RIGHT")
      playSound("move", settings);
    if (command.type === "HARD_DROP") {
      playSound("drop", settings);
      pulseHaptic("light", settings);
    }
    if (state.piecesPlaced !== locked) {
      persist();
      const event = state.lastEvent;
      if (event && (event.linesCleared || event.tSpin !== "none")) {
        const names = ["", "SINGLE", "DOUBLE", "TRIPLE", "FOUR LINES"];
        el("feedback").textContent =
          `${event.perfectClear ? "PERFECT CLEAR" : event.tSpin !== "none" ? "T-SPIN" : names[event.linesCleared]}${event.combo > 0 ? ` · ${event.combo + 1} COMBO` : ""} +${num(event.pointsAwarded)}`;
        feedbackUntil = performance.now() + 1500;
        flashRows = settings.reducedMotion ? [] : event.rows;
        playSound("clear", settings);
        pulseHaptic("clear", settings);
      }
    }
    if (state.level > level) playSound("level", settings);
    if (state.status === "gameover" || state.status === "victory") terminal();
  }
  const controls = new TouchControls(
    root,
    send,
    () => settings,
    () => screen === "game" && modal === "" && state?.status === "playing",
    () => {
      if (modal) back();
      else pause();
    },
  );
  function draw() {
    if (!state || screen !== "game") return;
    const now = performance.now();
    el("mode-label").textContent = MODE_NAMES[state.mode].toUpperCase();
    el("score").textContent = num(state.score);
    el("lines").textContent =
      state.mode === "sprint40" ? `${state.lines}/40` : String(state.lines);
    el("level").textContent = String(state.level);
    el("time-label").textContent = state.mode === "ultra120" ? "LEFT" : "TIME";
    el("time").textContent = formatTime(
      state.mode === "ultra120" ? 120000 - state.elapsedMs : state.elapsedMs,
    );
    el("goal").innerHTML =
      state.mode === "marathon"
        ? "ENDLESS<br>POSSIBILITY"
        : state.mode === "sprint40"
          ? `${Math.max(0, 40 - state.lines)} LINES<br>TO GO`
          : "TWO MINUTES.<br>ALL YOU.";
    el("piece-count").textContent = `${state.piecesPlaced} PIECES`;
    el("lock-meter").style.width =
      `${Math.min(100, (state.active?.lockTimerMs ?? 0) / 5)}%`;
    el("feedback").classList.toggle("visible", now < feedbackUntil);
    drawBoard(
      canvas,
      state,
      settings.ghostEnabled,
      now < feedbackUntil - 1250 ? flashRows : [],
    );
    drawPreview(
      el<HTMLCanvasElement>("hold"),
      state.hold,
      state.holdUsedThisTurn,
    );
    state.nextQueue
      .slice(0, 5)
      .forEach((type, i) =>
        drawPreview(el<HTMLCanvasElement>(`next-${i}`), type),
      );
  }
  function back() {
    if (
      modal === "settings" ||
      modal === "help" ||
      modal === "records" ||
      modal === "confirm"
    ) {
      closeModal();
      if (screen === "game" && state?.status === "paused") pause();
    } else if (modal === "pause" || modal === "result") home();
    else if (screen === "game") pause();
    else void exitApp();
  }
  root.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>(
      "button",
    );
    if (!target) return;
    if (target.dataset.mode) {
      requestRun(target.dataset.mode as GameMode);
      return;
    }
    switch (target.dataset.action) {
      case "resume":
        resume();
        break;
      case "pause":
        pause();
        break;
      case "home":
        home();
        break;
      case "settings":
        showSettings();
        break;
      case "records":
        showRecords(stats);
        break;
      case "help":
        help();
        break;
      case "close":
        closeModal();
        if (screen === "game" && state?.status === "paused") pause();
        break;
      case "restart":
        requestRun(state?.mode ?? "marathon");
        break;
      case "confirm-new":
        newRun(pendingMode);
        break;
    }
  });
  root.addEventListener("change", (event) => {
    const input = event.target as HTMLInputElement | HTMLSelectElement;
    if (!input.closest("#settings-form")) return;
    if (input instanceof HTMLInputElement && input.type === "checkbox")
      settings = { ...settings, [input.name]: input.checked };
    else if (input.name === "controlScheme")
      settings = {
        ...settings,
        controlScheme: input.value as "buttons" | "hybrid",
      };
    else settings = { ...settings, [input.name]: Number(input.value) };
    if (!saveSettings(settings)) el("storage-notice").hidden = false;
    applySettings();
  });
  layer.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button,input,select,[tabindex="0"]',
      ),
    );
    const first = focusable[0],
      last = focusable[focusable.length - 1];
    if (
      event.shiftKey &&
      (document.activeElement === first || document.activeElement === dialog)
    ) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  });
  const backgroundPause = () => {
    controls.releaseAll();
    if (state?.status === "playing") {
      applyCommand(state, { type: "PAUSE" });
      persist();
      if (screen === "game") pause();
    } else persist();
    previous = 0;
  };
  void setupLifecycle({ onPause: backgroundPause, onBack: back });
  window.addEventListener("pagehide", backgroundPause);
  function frame(now: number) {
    const dt = previous ? Math.min(100, Math.max(0, now - previous)) : 0;
    previous = now;
    controls.update(now);
    if (state?.status === "playing" && screen === "game" && !modal) {
      send({ type: "TICK", dtMs: dt });
      if (now - lastSave > 5000) {
        persist();
        lastSave = now;
      }
    }
    draw();
    requestAnimationFrame(frame);
  }
  updateResume();
  requestAnimationFrame(frame);
}
