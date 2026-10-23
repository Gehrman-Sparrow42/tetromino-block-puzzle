import "./theme-unlocks.css";
import { isThemeId, type ThemeId } from "../contracts/theme-catalog";
import {
  loadThemeAccess,
  isThemeUnlocked,
  grantThemeUnlock,
} from "../platform/theme-access";
import type {
  GameCommand,
  GameMode,
  PersonalBestStats,
  UserSettings,
  MarathonOptions,
} from "../contracts/game-contract";
import { controlProfileKey } from "../contracts/game-contract";
import {
  createInitialState,
  applyCommand,
  canRewardedContinue,
  applyRewardedContinue,
} from "../engine/engine";
import { createRewardedAds } from "../platform/rewarded-ads";
import {
  loadSettings,
  saveSettings,
  loadStats,
  recordResult,
  loadRun,
  saveRun,
  clearRun,
  DEFAULT_SETTINGS,
} from "../platform/storage";
import { playSound } from "../platform/audio";
import { pulseHaptic } from "../platform/haptics";
import { setupLifecycle, exitApp } from "../platform/lifecycle";
import { drawBoard, drawPreview } from "./canvas-renderer";
import { TouchControls } from "./touch-controls";
import { THEMES, applyTheme, getTheme } from "./themes";
import {
  computeBoardGeometry,
  computeControlGeometry,
  computeRailGeometry,
} from "./control-layout";
import { ControlEditor } from "./control-editor";
import { measureControlViewport } from "./control-viewport";

const MODE_NAMES: Record<GameMode, string> = {
  marathon: "Marathon",
  sprint40: "Sprint 40",
  ultra120: "Ultra 120",
};
const num = (value: number) => value.toLocaleString("en-US");
export function formatTime(ms: number, hundredths = false, countdown = false) {
  const value = Math.max(0, ms);
  const seconds = countdown
    ? Math.ceil(value / 1000)
    : Math.floor(value / 1000);
  const clock = `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
  return hundredths
    ? `${clock}.${Math.floor((value % 1000) / 10)
        .toString()
        .padStart(2, "0")}`
    : clock;
}
const CONTROL_ICONS: Record<string, string> = {
  MOVE_LEFT: "←",
  MOVE_RIGHT: "→",
  SOFT_DROP: "↓",
  HARD_DROP: `<svg viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 7 6 7-6M9 14l7 6 7-6M8 26h16"/></svg>`,
  ROTATE_CCW: "↶",
  ROTATE_CW: "↷",
  HOLD: "⇄",
};
const control = (command: string, label: string) =>
  `<button class="control" data-command="${command}" aria-label="${label}"><span aria-hidden="true">${CONTROL_ICONS[command]}</span></button>`;
const padOutline = `<svg class="pad-outline" viewBox="0 0 300 200" preserveAspectRatio="none" aria-hidden="true"><path d="M2 2H298V98H198V198H102V98H2Z"/></svg>`;

export function startApp(root: HTMLDivElement) {
  const rewardedAds = createRewardedAds();
  let rewardRequest: AbortController | null = null;
  let settings = loadSettings(),
    stats = loadStats(),
    state = loadRun();
  const themeAccess = loadThemeAccess(settings.theme);
  if (!isThemeUnlocked(themeAccess, settings.theme)) {
    settings = { ...settings, theme: "ink" };
    saveSettings(settings);
  }
  let themePreview: ThemeId | null = null;
  let themeRequest: AbortController | null = null;
  let themeGeneration = 0;
  let screen: "home" | "game" = "home",
    modal = "",
    previous = 0,
    lastSave = 0,
    recorded = false;
  let feedbackUntil = 0,
    flashRows: number[] = [],
    pendingMode: GameMode = "marathon";
  let pendingMarathon: MarathonOptions = {
    startingLevel: 1,
    speedMode: "progressive",
  };
  root.innerHTML = `
    <main class="shell">
      <section id="home" class="home-screen" aria-label="Main menu">
        <h1>Afterblock</h1>
        <button id="resume-card" class="resume-card" data-action="resume"><span><strong>Resume</strong><small id="resume-detail"></small></span><span aria-hidden="true">→</span></button>
        <div class="mode-list" aria-label="Choose a game mode">
          <button class="mode-card" data-mode="marathon"><span><strong>Marathon</strong><small>Endless</small></span><span aria-hidden="true">∞</span></button>
          <button class="mode-card" data-mode="sprint40"><span><strong>Sprint 40</strong><small>40 lines</small></span><span aria-hidden="true">→</span></button>
          <button class="mode-card" data-mode="ultra120"><span><strong>Ultra 120</strong><small>2 minutes</small></span><span aria-hidden="true">◷</span></button>
        </div>
        <nav class="home-links" aria-label="Menu"><button data-action="records">Records</button><button data-action="settings">Settings</button><button data-action="help">Help</button></nav>
      </section>
      <section id="game" class="game-screen" hidden aria-label="Game">
        <div class="play-area">
          <aside class="left-rail" aria-label="Run status">
            <button class="hold-panel" data-command="HOLD" aria-label="Hold piece"><span>Hold</span><canvas id="hold" aria-hidden="true"></canvas></button>
            <div class="rail-stats">
              <div class="hud-score"><span id="mode-label">Marathon</span><strong id="score">0</strong></div>
              <div><span>Lines</span><strong id="lines">0</strong></div>
              <div><span>Level</span><strong id="level">1</strong></div>
              <div><span id="time-label">Time</span><strong id="time">00:00</strong></div>
            </div>
          </aside>
          <aside class="next-rail" aria-label="Upcoming pieces">
            <button class="icon-button pause-button" data-action="pause" aria-label="Pause game">Ⅱ</button>
            <div class="next-strip"><span>Next</span>${Array.from({ length: 1 }, (_, i) => `<canvas id="next-${i}" aria-label="Upcoming piece ${i + 1}"></canvas>`).join("")}</div>
          </aside>
          <div class="playfield"><div class="board-wrap"><canvas id="board" role="img" aria-label="Tetromino playfield, ten columns and twenty rows"></canvas><div id="feedback" class="feedback" aria-live="polite"></div></div></div>
          <div class="control-deck" aria-label="Game controls">
            <div class="movement-pad" data-movement-pad>${padOutline}${control("MOVE_LEFT", "Left")}${control("SOFT_DROP", "Soft drop")}${control("MOVE_RIGHT", "Right")}</div>${control("HARD_DROP", "Hard drop")}${control("HOLD", "Hold")}${control("ROTATE_CCW", "Rotate left")}${control("ROTATE_CW", "Rotate right")}
          </div>
        </div>
      </section>
    </main>
    <div id="modal-layer" class="modal-layer" hidden><section id="dialog" class="sheet" role="dialog" aria-modal="true" aria-labelledby="dialog-title" tabindex="-1"></section></div>
    <div id="storage-notice" class="storage-notice" role="status" hidden>Storage unavailable. Progress cannot be saved.</div>`;
  const el = <T extends HTMLElement = HTMLElement>(id: string) =>
    root.querySelector<T>(`#${id}`)!;
  const dialog = el("dialog"),
    layer = el("modal-layer"),
    canvas = el<HTMLCanvasElement>("board");
  let lastFocus: HTMLElement | null = null;
  let controlEditor: ControlEditor | null = null;
  const orientation = () =>
    window.innerWidth > window.innerHeight
      ? ("landscape" as const)
      : ("portrait" as const);
  function layoutControls() {
    controls.releaseAll();
    const area = root.querySelector<HTMLElement>(".play-area")!;
    const width = area.clientWidth,
      height = area.clientHeight;
    if (!width || !height) {
      drawControlPreview();
      return;
    }
    const geometry = computeControlGeometry(
      width,
      height,
      settings,
      orientation(),
    );
    const deck = root.querySelector<HTMLElement>(".control-deck")!;
    deck.style.height = `${geometry.height}px`;
    deck.style.position = "absolute";
    deck.style.left = "0";
    deck.style.bottom = "0";
    const pad = deck.querySelector<HTMLElement>(".movement-pad")!;
    if (geometry.pad) {
      Object.assign(pad.style, {
        left: `${geometry.pad.x}px`,
        top: `${geometry.pad.y}px`,
        width: `${geometry.pad.width}px`,
        height: `${geometry.pad.height}px`,
      });
      pad.style.setProperty(
        "--control-opacity",
        String(geometry.groupOpacity?.pad ?? settings.controlOpacity),
      );
    } else pad.removeAttribute("style");
    const groupForAction = {
      MOVE_LEFT: "left",
      MOVE_RIGHT: "right",
      SOFT_DROP: "down",
      HARD_DROP: "hardDrop",
      HOLD: "hold",
      ROTATE_CW: "rotateCW",
      ROTATE_CCW: "rotateCCW",
    } as const;
    for (const [action, rect] of Object.entries(geometry.buttons)) {
      const button = deck.querySelector<HTMLElement>(
        `[data-command="${action}"]`,
      )!;
      const inPad =
        geometry.pad &&
        ["MOVE_LEFT", "MOVE_RIGHT", "SOFT_DROP"].includes(action);
      Object.assign(button.style, {
        left: `${rect.x - (inPad ? geometry.pad!.x : 0)}px`,
        top: `${rect.y - (inPad ? geometry.pad!.y : 0)}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      });
      const group = groupForAction[action as keyof typeof groupForAction];
      button.hidden = !!geometry.groupHidden?.[group];
      if (group === "hold")
        root.querySelector<HTMLElement>(".hold-panel")!.hidden = button.hidden;
      if (geometry.groupOpacity)
        button.style.setProperty(
          "--control-opacity",
          String(geometry.groupOpacity[group]),
        );
      else button.style.removeProperty("--control-opacity");
    }
    const boardRect = computeBoardGeometry(
      width,
      height,
      geometry,
      settings.controlLayout,
    );
    const board = root.querySelector<HTMLElement>(".board-wrap")!;
    Object.assign(board.style, {
      position: "absolute",
      left: `${boardRect.x}px`,
      top: `${boardRect.y}px`,
      width: `${boardRect.width}px`,
      height: `${boardRect.height}px`,
    });
    const rails = computeRailGeometry(
      boardRect,
      height,
      geometry,
      settings.controlLayout,
    );
    for (const [side, rect] of Object.entries(rails)) {
      const rail = root.querySelector<HTMLElement>(
        side === "left" ? ".left-rail" : ".next-rail",
      )!;
      rail.style.setProperty("--rail-height", `${rect.height}px`);
      Object.assign(rail.style, {
        left: `${rect.x}px`,
        top: `${rect.y}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      });
    }
    drawControlPreview();
  }
  function drawControlPreview() {
    const preview = dialog.querySelector<HTMLElement>(".control-preview");
    if (!preview) return;
    const actualWidth = preview.clientWidth;
    if (!actualWidth) return;
    const viewport = measureControlViewport(el("game"));
    const geometry = computeControlGeometry(
      viewport.width,
      viewport.height,
      settings,
      viewport.orientation,
    );
    const scale = Math.min(actualWidth / viewport.width, 240 / viewport.height);
    const offset = (actualWidth - viewport.width * scale) / 2;
    const board = computeBoardGeometry(
      viewport.width,
      viewport.height,
      geometry,
      settings.controlLayout,
    );
    const deckTop =
      settings.controlLayout === "gamepad"
        ? 0
        : viewport.height - geometry.height;
    const groupForAction = {
      MOVE_LEFT: "left",
      MOVE_RIGHT: "right",
      SOFT_DROP: "down",
      HARD_DROP: "hardDrop",
      HOLD: "hold",
      ROTATE_CW: "rotateCW",
      ROTATE_CCW: "rotateCCW",
    } as const;
    preview.dataset.layout = settings.controlLayout;
    preview.dataset.viewportWidth = String(viewport.width);
    preview.dataset.viewportHeight = String(viewport.height);
    preview.style.height = `${viewport.height * scale}px`;
    const padPreview = geometry.pad
      ? `<b class="movement-preview" style="--control-opacity:${geometry.groupOpacity?.pad};left:${offset + geometry.pad.x * scale}px;top:${geometry.pad.y * scale}px;width:${geometry.pad.width * scale}px;height:${geometry.pad.height * scale}px">${padOutline}</b>`
      : "";
    const rails = computeRailGeometry(
      board,
      viewport.height,
      geometry,
      settings.controlLayout,
    );
    const railPreview = Object.entries(rails)
      .map(
        ([side, rect]) =>
          `<div class="control-reference-rail" style="left:${offset + rect.x * scale}px;top:${rect.y * scale}px;width:${rect.width * scale}px;height:${rect.height * scale}px;font-size:${9 * scale}px">${side === "left" ? "Hold<br>Score<br>Lines<br>Level<br>Time" : "Pause<br>Next"}</div>`,
      )
      .join("");
    preview.innerHTML =
      railPreview +
      `<div class="control-preview-board" style="left:${offset + board.x * scale}px;top:${board.y * scale}px;width:${board.width * scale}px;height:${board.height * scale}px"></div>` +
      padPreview +
      Object.entries(geometry.buttons)
        .filter(
          ([action]) =>
            !geometry.groupHidden?.[
              groupForAction[action as keyof typeof groupForAction]
            ],
        )
        .map(([action, rect]) => {
          const opacity =
            geometry.groupOpacity?.[
              groupForAction[action as keyof typeof groupForAction]
            ] ?? settings.controlOpacity;
          return `<i data-preview-command="${action}" style="--control-opacity:${opacity};left:${offset + rect.x * scale}px;top:${(rect.y + deckTop) * scale}px;width:${rect.width * scale}px;height:${rect.height * scale}px"><span style="--preview-icon-size:${32 * scale}px">${CONTROL_ICONS[action]}</span></i>`;
        })
        .join("");
  }

  const applySettings = () => {
    controls.releaseAll();
    root.classList.toggle("reduce-motion", settings.reducedMotion);
    el("game").dataset.layout = settings.controlLayout;
    root.style.setProperty(
      "--control-opacity",
      String(settings.controlOpacity),
    );
    applyTheme(settings.theme);
    const currentTheme = dialog.querySelector<HTMLElement>(
      "[data-current-theme]",
    );
    if (currentTheme) currentTheme.textContent = THEMES[settings.theme].name;
    syncControlFields();
    layoutControls();
    drawControlPreview();
    draw();
  };
  function syncControlFields() {
    for (const name of ["gamepadPreset"]) {
      const row = dialog.querySelector(`[name="${name}"]`)?.closest("label");
      if (row) row.hidden = settings.controlLayout !== "gamepad";
    }
    for (const name of ["controlSpread"]) {
      const row = dialog.querySelector(`[name="${name}"]`)?.closest("label");
      if (row) row.hidden = settings.controlLayout === "gamepad";
    }
  }
  function persist() {
    if (
      state &&
      ["playing", "paused"].includes(state.status) &&
      !saveRun(state)
    )
      el("storage-notice").hidden = false;
  }
  function home() {
    if (modal === "continue") finishRun();
    cancelRewardRequest();
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
        `${MODE_NAMES[state.mode]} · ${num(state.score)}`;
  }
  function showModal(type: string, content: string) {
    if (type !== "theme-unlock") cancelThemePreview();
    controls.releaseAll();
    lastFocus = document.activeElement as HTMLElement;
    modal = type;
    layer.hidden = false;
    root.querySelector<HTMLElement>(".shell")!.inert = true;
    dialog.innerHTML = content;
    dialog.scrollTop = 0;
    dialog.focus();
  }
  function closeModal() {
    cancelThemePreview();
    modal = "";
    layer.hidden = true;
    root.querySelector<HTMLElement>(".shell")!.inert = false;
    dialog.innerHTML = "";
    if (lastFocus?.isConnected) lastFocus.focus({ preventScroll: true });
  }
  function editControls() {
    closeModal();
    controls.releaseAll();
    modal = "controls";
    root.querySelector<HTMLElement>(".shell")!.inert = true;
    const finish = () => {
      controlEditor?.destroy();
      controlEditor = null;
      modal = "";
      root.querySelector<HTMLElement>(".shell")!.inert = false;
      showSettings();
    };
    controlEditor = new ControlEditor(root, settings, {
      onSave: (edited) => {
        settings = edited;
        if (!saveSettings(settings)) el("storage-notice").hidden = false;
        applySettings();
        finish();
      },
      onCancel: finish,
    });
  }
  const sheetHead = (title: string, close = true) =>
    `<div class="sheet-top"><h2 id="dialog-title">${title}</h2>${close ? '<button class="icon-button" data-action="close" aria-label="Close dialog">×</button>' : ""}</div>`;
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
      `${sheetHead("Paused", false)}<div class="sheet-stats"><span>Score<strong>${num(state.score)}</strong></span><span>Lines<strong>${state.lines}</strong></span><span>Time<strong>${formatTime(state.elapsedMs, state.mode === "sprint40")}</strong></span></div><button class="primary-button" data-action="resume">Resume</button><button class="secondary-button" data-action="settings">Settings</button><div class="split-actions"><button data-action="restart">Restart</button><button data-action="home">Menu</button></div>`,
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
    layoutControls();
    root
      .querySelectorAll<HTMLButtonElement>("button")
      .forEach((button) => button.blur());
    draw();
  }
  function newRun(mode: GameMode) {
    cancelRewardRequest();
    state = createInitialState(
      mode,
      crypto.getRandomValues(new Uint32Array(1))[0],
      mode === "marathon" ? pendingMarathon : undefined,
    );
    state.rewardRunId = crypto.randomUUID();
    recorded = false;
    feedbackUntil = 0;
    flashRows = [];
    clearRun();
    persist();
    resume();
  }
  function requestRun(mode: GameMode, configured = false) {
    pendingMode = mode;
    if (mode === "marathon" && !configured) {
      if (state?.status === "playing") {
        controls.releaseAll();
        applyCommand(state, { type: "PAUSE" });
        persist();
      }
      pendingMarathon = {
        ...(state?.mode === "marathon" && state.marathonOptions
          ? state.marathonOptions
          : pendingMarathon),
      };
      showModal(
        "marathon-setup",
        `${sheetHead("Marathon")}<label class="setting-row"><span>Speed</span><select name="marathonSpeed" aria-label="Speed"><option value="progressive" ${pendingMarathon.speedMode === "progressive" ? "selected" : ""}>Progressive</option><option value="fixed" ${pendingMarathon.speedMode === "fixed" ? "selected" : ""}>Fixed</option></select></label><label class="setting-row"><span>Starting level</span><select name="marathonLevel" aria-label="Starting level">${Array.from({ length: 15 }, (_, i) => `<option value="${i + 1}" ${pendingMarathon.startingLevel === i + 1 ? "selected" : ""}>${i + 1}</option>`).join("")}</select></label><p id="speed-note">${pendingMarathon.speedMode === "fixed" ? "Speed stays constant." : "Faster every 10 lines."}</p><button class="primary-button" data-action="start-marathon">Start</button>`,
      );
      return;
    }
    if (state && ["playing", "paused"].includes(state.status)) {
      if (state.status === "playing") {
        controls.releaseAll();
        applyCommand(state, { type: "PAUSE" });
        persist();
      }
      showModal(
        "confirm",
        `${sheetHead("Replace saved run?")}<p>Your ${MODE_NAMES[state.mode]} run will be replaced.</p><button class="primary-button" data-action="confirm-new">Start ${MODE_NAMES[mode]}</button><button class="secondary-button" data-action="close">Cancel</button>`,
      );
    } else newRun(mode);
  }
  function showSettings(themePickerOpen = false) {
    if (state?.status === "playing") {
      applyCommand(state, { type: "PAUSE" });
      persist();
    }
    const toggle = (key: keyof UserSettings, title: string, value: boolean) =>
      `<label class="setting-row"><span>${title}</span><input type="checkbox" name="${key}" ${value ? "checked" : ""}/></label>`;
    const range = (
      key: keyof UserSettings,
      title: string,
      min: number,
      max: number,
      step: number,
      label = title,
    ) =>
      `<label class="setting-row range-row"><span>${title}</span><input name="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${settings[key]}" aria-label="${label}"/></label>`;
    const select = (
      key: keyof UserSettings,
      title: string,
      options: [string, string][],
      label = title,
    ) =>
      `<label class="setting-row"><span>${title}</span><select name="${key}" aria-label="${label}">${options.map(([value, text]) => `<option value="${value}" ${settings[key] === value ? "selected" : ""}>${text}</option>`).join("")}</select></label>`;
    showModal(
      "settings",
      `${sheetHead("Settings")}<form id="settings-form">
      <details class="theme-picker" ${themePickerOpen ? "open" : ""}>
        <summary><span>Theme</span><strong data-current-theme>${THEMES[settings.theme].name}</strong></summary>
        <fieldset class="theme-options"><legend>Choose theme</legend>
        ${Object.values(THEMES)
          .map((theme) => {
            const swatches = `<span class="theme-swatches" aria-hidden="true"><i style="background:${theme.css["--bg"]}"></i><i style="background:${theme.css["--accent"]}"></i><i style="background:${theme.pieces.T}"></i></span>`;
            return isThemeUnlocked(themeAccess, theme.id)
              ? `<label class="theme-choice"><input type="radio" name="theme" value="${theme.id}" ${settings.theme === theme.id ? "checked" : ""}>${swatches}<span>${theme.name}</span></label>`
              : `<button type="button" class="theme-choice theme-locked" data-action="preview-theme" data-theme-id="${theme.id}" aria-label="Preview ${theme.name}">${swatches}<span class="theme-choice-name">${theme.name}</span><span class="theme-preview-label">Preview</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg></button>`;
          })
          .join("")}
        </fieldset>
      </details>
      <h3>Controls</h3>
      ${select(
        "controlLayout",
        "Layout",
        [
          ["gamepad", "Buttons"],
          ["thumbs", "Thumb"],
          ["mirror", "Left-handed"],
          ["floating", "Floating"],
        ],
        "Control layout",
      )}
      ${select(
        "gamepadPreset",
        "Preset",
        [
          ["balanced", "Balanced"],
          ["compact", "Compact"],
          ["mirrored", "Mirrored"],
        ],
        "Gamepad preset",
      )}
      <div class="control-preview" aria-hidden="true"></div>
      <button type="button" class="secondary-button" data-action="edit-controls">Edit controls</button>
      ${range("controlScale", "Size", 0.85, 2, 0.01, "Control size")}
      ${range("controlOpacity", "Opacity", 0.08, 0.6, 0.01, "Control opacity")}
      ${range("boardScale", "Board size", 0.5, 1, 0.01, "Board size")}
      <button type="button" class="secondary-button" data-action="reset-controls">Reset controls</button>
      ${select(
        "controlScheme",
        "Input",
        [
          ["buttons", "Buttons"],
          ["hybrid", "Buttons + swipes"],
        ],
        "Touch control scheme",
      )}
      ${range("dasMs", "Move delay", 80, 300, 5, "Move repeat delay")}
      ${range("arrMs", "Repeat interval", 16, 100, 1, "Move repeat interval")}
      <h3>Sound & display</h3>
      ${toggle("soundEnabled", "Sound", settings.soundEnabled)}
      ${range("soundVolume", "Volume", 0, 1, 0.05, "Sound volume")}
      ${toggle("hapticsEnabled", "Haptics", settings.hapticsEnabled)}
      ${toggle("ghostEnabled", "Ghost piece", settings.ghostEnabled)}
      ${toggle("reducedMotion", "Reduced motion", settings.reducedMotion)}
      </form><button class="primary-button" data-action="close">Done</button>`,
    );
    syncControlFields();
    drawControlPreview();
  }
  function cancelThemePreview() {
    themeGeneration++;
    themeRequest?.abort();
    themeRequest = null;
    if (themePreview) {
      themePreview = null;
      applyTheme(settings.theme);
      draw();
    }
  }
  function previewTheme(id: ThemeId, message = "") {
    if (themePreview !== id) cancelThemePreview();
    themePreview = id;
    applyTheme(id);
    showModal(
      "theme-unlock",
      `${sheetHead(`Unlock ${THEMES[id].name}`, false)}
      <p>Watch 1 ad to unlock. Stays available offline.</p>
      <p class="theme-unlock-status" role="status">${message || (!rewardedAds.enabled ? "Ads unavailable. You can still use the four free themes." : "")}</p>
      <button class="primary-button" data-action="unlock-theme" ${!rewardedAds.enabled || themeRequest ? "disabled" : ""}>${themeRequest ? "Waiting for ad…" : !rewardedAds.enabled ? "Ads unavailable" : rewardedAds.isTest ? "Test ad · unlock" : "Watch ad · unlock"}</button>
      <button class="secondary-button" data-action="cancel-theme">Back</button>`,
    );
    draw();
  }
  async function unlockTheme() {
    if (
      !rewardedAds.enabled ||
      themeRequest ||
      !themePreview ||
      modal !== "theme-unlock"
    )
      return;
    const target = themePreview;
    const generation = themeGeneration;
    const request = new AbortController();
    themeRequest = request;
    previewTheme(target);
    const current = () =>
      !request.signal.aborted &&
      themeRequest === request &&
      themeGeneration === generation &&
      themePreview === target &&
      modal === "theme-unlock";
    try {
      const result = await rewardedAds.requestThemeUnlock(
        themeAccess.profileId,
        target,
        request.signal,
      );
      if (!current()) return;
      themeRequest = null;
      if (!result.earned) {
        previewTheme(target, "Ad not completed. Try again or go back.");
        return;
      }
      if (!grantThemeUnlock(themeAccess, target)) {
        previewTheme(
          target,
          "Unlock could not be saved. Check storage and try again.",
        );
        return;
      }
      settings = { ...settings, theme: target };
      if (!saveSettings(settings)) el("storage-notice").hidden = false;
      themePreview = null;
      applySettings();
      showSettings(true);
    } catch {
      if (!current()) return;
      themeRequest = null;
      previewTheme(target, "Ad unavailable. Try again or go back.");
    }
  }
  function showRecords(current: PersonalBestStats) {
    showModal(
      "records",
      `${sheetHead("Records")}<div class="record"><span>Marathon / score</span><strong>${num(current.marathonHighScore)}</strong></div><div class="record"><span>Marathon / lines</span><strong>${num(current.marathonMaxLines)}</strong></div><div class="record"><span>Fixed / score</span><strong>${num(current.marathonFixedHighScore ?? 0)}</strong></div><div class="record"><span>Fixed / lines</span><strong>${num(current.marathonFixedMaxLines ?? 0)}</strong></div><div class="record"><span>Sprint 40 / fastest</span><strong>${current.sprint40BestTimeMs === null ? "—" : formatTime(current.sprint40BestTimeMs, true)}</strong></div><div class="record"><span>Ultra 120 / score</span><strong>${num(current.ultra120HighScore)}</strong></div><p class="record-note">${num(current.gamesPlayed)} games</p><button class="primary-button" data-action="close">Close</button>`,
    );
  }
  function help() {
    showModal(
      "help",
      `${sheetHead("Help")}<div class="help-copy">
      <p>Fill a horizontal row to clear it. The game ends when the stack reaches the top.</p>
      <p>Marathon: endless, faster every 10 lines.<br>Sprint 40: clear 40 lines.<br>Ultra 120: score in 2 minutes.</p>
      <h3>Touch</h3><p>← / → move · ↓ soft drop · ⇓ hard drop<br>↶ / ↷ rotate · ⇄ hold</p>
      <p>Hold swaps once per piece. Next shows the upcoming piece.</p>
      <h3>Keyboard</h3><p>Arrows move · Z / X rotate · C / Shift hold<br>Space drops · P / Escape pauses</p>
      <h3>Swipes</h3><p>Enable in Settings. Tap rotates; swipe sideways moves, down drops, up holds.</p>
      <h3>Scoring</h3><p>Clear several rows together, combos and T-spins for extra points. Consecutive four-line clears and T-spins earn a bonus.</p>
      </div><button class="primary-button" data-action="close">Close</button>`,
    );
  }
  function cancelRewardRequest() {
    rewardRequest?.abort();
    rewardRequest = null;
  }
  function offerContinue(message = "") {
    showModal(
      "continue",
      `${sheetHead("Continue?", false)}<p>Clear the bottom 2 rows and continue once this Marathon. This run will not update personal bests.</p><p role="status" data-reward-status>${message}</p><button class="primary-button" data-action="watch-ad" ${rewardRequest ? "disabled" : ""}>${rewardRequest ? "Waiting for ad…" : message ? "Try again" : rewardedAds.isTest ? "Test ad · clear 2 rows" : "Watch ad · clear 2 rows"}</button><button class="secondary-button" data-action="end-run">End run</button>`,
    );
  }
  async function requestContinue() {
    if (
      !state ||
      rewardRequest ||
      modal !== "continue" ||
      !canRewardedContinue(state)
    )
      return;
    const run = state;
    run.rewardRunId ??= crypto.randomUUID();
    const request = new AbortController();
    rewardRequest = request;
    offerContinue();
    try {
      const result = await rewardedAds.requestContinue(
        run.rewardRunId,
        request.signal,
      );
      if (
        request.signal.aborted ||
        rewardRequest !== request ||
        state !== run ||
        modal !== "continue"
      )
        return;
      rewardRequest = null;
      if (result.earned && applyRewardedContinue(run)) {
        feedbackUntil = 0;
        flashRows = [];
        previous = 0;
        persist();
        pause();
        draw();
      } else offerContinue("Ad not completed. Try again or end the run.");
    } catch {
      if (
        request.signal.aborted ||
        rewardRequest !== request ||
        state !== run ||
        modal !== "continue"
      )
        return;
      rewardRequest = null;
      offerContinue("Ad unavailable. Try again or end the run.");
    }
  }
  function terminal() {
    if (!state || recorded || modal === "continue") return;
    if (rewardedAds.enabled && canRewardedContinue(state)) {
      controls.releaseAll();
      clearRun();
      playSound("over", settings);
      offerContinue();
      return;
    }
    finishRun();
  }
  function finishRun() {
    if (!state || recorded) return;
    cancelRewardRequest();
    recorded = true;
    controls.releaseAll();
    stats = recordResult(state);
    clearRun();
    playSound("over", settings);
    const won = state.status === "victory";
    showModal(
      "result",
      `${sheetHead(won ? "Complete" : "Game over", false)}<div class="result-score">${num(state.score)}<span>Score</span></div><div class="sheet-stats"><span>Lines<strong>${state.lines}</strong></span><span>Level<strong>${state.level}</strong></span><span>Time<strong>${formatTime(state.elapsedMs, state.mode === "sprint40")}</strong></span></div><button class="primary-button" data-action="restart">Play again</button><button class="secondary-button" data-action="home">Menu</button>`,
    );
  }
  function send(command: GameCommand) {
    if (!state || screen !== "game") return;
    if (state.status !== "playing" && command.type !== "SOFT_DROP") return;
    const locked = state.piecesPlaced,
      level = state.level;
    const active = state.active;
    const before = active
      ? { x: active.x, y: active.y, rotation: active.rotation }
      : null;
    applyCommand(state, command);
    const changed =
      !!before &&
      !!state.active &&
      (before.x !== state.active.x ||
        before.y !== state.active.y ||
        before.rotation !== state.active.rotation);
    if (
      changed &&
      (command.type === "ROTATE_CW" || command.type === "ROTATE_CCW")
    )
      playSound("rotate", settings);
    if (
      changed &&
      (command.type === "MOVE_LEFT" || command.type === "MOVE_RIGHT")
    )
      playSound("move", settings);
    if (
      state.piecesPlaced !== locked ||
      (command.type === "HOLD" && state.active !== active)
    )
      controls.pieceChanged();
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
        feedbackUntil = performance.now() + 450;
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
    (key) => {
      if (key === "back") back();
      else if (screen === "game" && modal === "pause") resume();
      else if (screen === "game" && !modal) pause();
    },
  );
  function draw() {
    if (!state || screen !== "game") return;
    const now = performance.now();
    el("mode-label").textContent = MODE_NAMES[state.mode];
    const score = el("score");
    score.textContent =
      state.score < 100000
        ? num(state.score)
        : new Intl.NumberFormat("en", {
            notation: "compact",
            maximumFractionDigits: 1,
          }).format(state.score);
    score.title = num(state.score);
    score.setAttribute("aria-label", `${num(state.score)} points`);
    el("lines").textContent =
      state.mode === "sprint40" ? `${state.lines}/40` : String(state.lines);
    el("level").textContent = String(state.level);
    el("time-label").textContent = state.mode === "ultra120" ? "Left" : "Time";
    el("time").textContent = formatTime(
      state.mode === "ultra120" ? 120000 - state.elapsedMs : state.elapsedMs,
      state.mode === "sprint40",
      state.mode === "ultra120",
    );
    el("feedback").classList.toggle("visible", now < feedbackUntil);
    drawBoard(
      canvas,
      state,
      settings.ghostEnabled,
      now < feedbackUntil - 300 ? flashRows : [],
      getTheme(themePreview ?? settings.theme),
    );
    drawPreview(
      el<HTMLCanvasElement>("hold"),
      state.hold,
      state.holdUsedThisTurn,
      getTheme(themePreview ?? settings.theme),
    );
    state.nextQueue
      .slice(0, 1)
      .forEach((type, i) =>
        drawPreview(
          el<HTMLCanvasElement>(`next-${i}`),
          type,
          false,
          getTheme(themePreview ?? settings.theme),
        ),
      );
  }
  function back() {
    if (modal === "theme-unlock") {
      showSettings(true);
      return;
    }
    if (modal === "controls") {
      controlEditor?.cancel();
      return;
    }
    if (
      modal === "settings" ||
      modal === "help" ||
      modal === "records" ||
      modal === "confirm" ||
      modal === "marathon-setup"
    ) {
      closeModal();
      if (screen === "game" && state?.status === "paused") pause();
    } else if (modal === "continue") finishRun();
    else if (modal === "pause" || modal === "result") home();
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
      case "preview-theme":
        if (isThemeId(target.dataset.themeId))
          previewTheme(target.dataset.themeId);
        break;
      case "unlock-theme":
        void unlockTheme();
        break;
      case "cancel-theme":
        showSettings(true);
        break;
      case "watch-ad":
        void requestContinue();
        break;
      case "end-run":
        finishRun();
        break;
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
      case "reset-controls":
        settings = {
          ...settings,
          padMode: DEFAULT_SETTINGS.padMode,
          controlScale: DEFAULT_SETTINGS.controlScale,
          controlOpacity: DEFAULT_SETTINGS.controlOpacity,
          controlSpread: DEFAULT_SETTINGS.controlSpread,
          controlHeight: DEFAULT_SETTINGS.controlHeight,
          gamepadLayouts: { portrait: {}, landscape: {} },
          boardScale: 1,
        };
        saveSettings(settings);
        applySettings();
        for (const key of [
          "controlLayout",
          "gamepadPreset",
          "padMode",
          "controlScale",
          "controlOpacity",
          "controlSpread",
          "controlHeight",
          "boardScale",
        ] as const) {
          const input = dialog.querySelector<
            HTMLInputElement | HTMLSelectElement
          >(`[name="${key}"]`);
          if (input) input.value = String(settings[key]);
        }
        break;
      case "edit-controls":
        editControls();
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
      case "start-marathon": {
        const speed = dialog.querySelector<HTMLSelectElement>(
          '[name="marathonSpeed"]',
        )!.value;
        const level = Number(
          dialog.querySelector<HTMLSelectElement>('[name="marathonLevel"]')!
            .value,
        );
        pendingMarathon = {
          speedMode: speed === "fixed" ? "fixed" : "progressive",
          startingLevel: Math.max(1, Math.min(15, Math.round(level) || 1)),
        };
        requestRun("marathon", true);
        break;
      }
    }
  });
  function changeSettings(event: Event) {
    const input = event.target as HTMLInputElement | HTMLSelectElement;
    if (input.name === "marathonSpeed") {
      el("speed-note").textContent =
        input.value === "fixed"
          ? "Speed stays constant."
          : "Faster every 10 lines.";
      return;
    }
    if (!input.closest("#settings-form")) return;
    if (
      input.name === "theme" &&
      (!isThemeId(input.value) || !isThemeUnlocked(themeAccess, input.value))
    )
      return;
    if (
      input instanceof HTMLInputElement &&
      input.type === "radio" &&
      !input.checked
    )
      return;
    const priorKey = controlProfileKey(settings);
    const profiles = {
      ...settings.controlProfiles,
      [priorKey]: {
        layouts: structuredClone(settings.gamepadLayouts),
        boardScale: settings.boardScale ?? 1,
      },
    };

    if (input instanceof HTMLInputElement && input.type === "checkbox")
      settings = { ...settings, [input.name]: input.checked };
    else if (
      [
        "controlScheme",
        "controlLayout",
        "gamepadPreset",
        "padMode",
        "theme",
      ].includes(input.name)
    )
      settings = { ...settings, [input.name]: input.value };
    else settings = { ...settings, [input.name]: Number(input.value) };
    settings.controlProfiles = profiles;
    if (input.name === "gamepadPreset" || input.name === "controlLayout") {
      const profile = profiles[controlProfileKey(settings)];
      settings.gamepadLayouts = structuredClone(
        profile?.layouts ?? { portrait: {}, landscape: {} },
      );
      settings.boardScale = profile?.boardScale ?? 1;
      const boardInput = dialog.querySelector<HTMLInputElement>(
        '[name="boardScale"]',
      );
      if (boardInput) boardInput.value = String(settings.boardScale);
    }
    if (!saveSettings(settings)) el("storage-notice").hidden = false;
    applySettings();
  }
  root.addEventListener("input", changeSettings);
  root.addEventListener("change", changeSettings);
  layer.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button:not(:disabled),input:not(:disabled),select:not(:disabled),summary,[tabindex="0"]',
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
  window.addEventListener("pagehide", () => {
    cancelThemePreview();
    backgroundPause();
  });
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
  const observer = new ResizeObserver(() => layoutControls());
  observer.observe(root.querySelector<HTMLElement>(".play-area")!);
  window.addEventListener("resize", layoutControls);
  applySettings();
  if (state && !state.rewardRunId) {
    state.rewardRunId = crypto.randomUUID();
    persist();
  }
  updateResume();
  requestAnimationFrame(frame);
}
