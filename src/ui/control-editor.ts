import type {
  ControlOrientation,
  GamepadControlId,
  GamepadControlPlacement,
  UserSettings,
} from "../contracts/game-contract";
import { GAMEPAD_CONTROL_IDS } from "../contracts/game-contract";
import { computeControlGeometry } from "./control-layout";
import "./control-editor.css";

const NAMES: Record<GamepadControlId, string> = {
  pad: "Movement pad",
  hardDrop: "Hard drop",
  rotateCW: "Rotate clockwise",
  rotateCCW: "Rotate counterclockwise",
  hold: "Hold",
};
const PATHS: Record<Exclude<GamepadControlId, "pad">, string> = {
  hardDrop: '<path d="m13 10 11 10 11-10m-22 11 11 10 11-10M12 38h24"/>',
  rotateCW: '<path d="M36 18a14 14 0 1 0 1 13M36 7v12H24"/>',
  rotateCCW: '<path d="M12 18a14 14 0 1 1-1 13M12 7v12h12"/>',
  hold: '<path d="M10 9v30m28-30v30M10 24h28M18 17l-8 7 8 7m12-14 8 7-8 7"/>',
};
interface EditorCallbacks {
  onSave: (settings: UserSettings) => void;
  onCancel: () => void;
}
interface Drag {
  id: GamepadControlId;
  pointer: number;
  x: number;
  y: number;
  centerX: number;
  centerY: number;
  previous: GamepadControlPlacement | undefined;
  orientation: ControlOrientation;
}

/** A staged editor: gameplay settings change only after Done. */
export class ControlEditor {
  private readonly wrapper: HTMLDivElement;
  private readonly stage: HTMLDivElement;
  private readonly targets = new Map<GamepadControlId, HTMLButtonElement>();
  private readonly settings: UserSettings;
  private readonly callbacks: EditorCallbacks;
  private readonly abort = new AbortController();
  private readonly observer: ResizeObserver;
  private readonly previousFocus = document.activeElement;
  private readonly sizeInput: HTMLInputElement;
  private readonly opacityInput: HTMLInputElement;
  private readonly selectionLabel: HTMLElement;
  private readonly orientationLabel: HTMLElement;
  private orientation: ControlOrientation;
  private selected: GamepadControlId = "pad";
  private drag: Drag | null = null;
  private destroyed = false;

  constructor(
    root: HTMLElement,
    settings: UserSettings,
    callbacks: EditorCallbacks,
  ) {
    this.settings = structuredClone(settings);
    this.settings.controlLayout = "gamepad";
    this.callbacks = callbacks;
    this.orientation = this.readOrientation();
    this.wrapper = document.createElement("div");
    this.wrapper.className = "control-editor";
    this.wrapper.setAttribute("role", "dialog");
    this.wrapper.setAttribute("aria-modal", "true");
    this.wrapper.setAttribute("aria-labelledby", "control-editor-title");
    this.wrapper.innerHTML = `
      <header class="control-editor-header">
        <button type="button" data-editor-action="cancel">Cancel</button>
        <h2 id="control-editor-title">Controls</h2>
        <button type="button" data-editor-action="done">Done</button>
      </header>
      <div class="control-editor-hint"><span>Drag to move. Select to resize.</span><span data-editor-orientation></span></div>
      <div class="control-editor-stage"><div class="control-editor-board" aria-hidden="true"></div></div>
      <footer class="control-editor-tools">
        <div class="control-editor-selection"><strong data-editor-selection></strong><button type="button" data-editor-action="reset">Reset layout</button></div>
        <label><span>Size</span><input name="editorControlSize" type="range" min="0.75" max="1.4" step="0.05"></label>
        <label><span>Opacity</span><input name="editorControlOpacity" type="range" min="0.08" max="0.6" step="0.01"></label>
      </footer>`;
    this.stage = this.wrapper.querySelector<HTMLDivElement>(
      ".control-editor-stage",
    )!;
    this.sizeInput = this.wrapper.querySelector<HTMLInputElement>(
      '[name="editorControlSize"]',
    )!;
    this.opacityInput = this.wrapper.querySelector<HTMLInputElement>(
      '[name="editorControlOpacity"]',
    )!;
    this.selectionLabel = this.wrapper.querySelector(
      "[data-editor-selection]",
    )!;
    this.orientationLabel = this.wrapper.querySelector(
      "[data-editor-orientation]",
    )!;
    for (const id of GAMEPAD_CONTROL_IDS) {
      const target = document.createElement("button");
      target.type = "button";
      target.className = `control-editor-target control-editor-target-${id}`;
      target.dataset.editorControl = id;
      target.setAttribute("aria-label", NAMES[id]);
      target.setAttribute("aria-pressed", String(id === this.selected));
      target.innerHTML =
        id === "pad"
          ? `<svg viewBox="0 0 300 200" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="M2 2H298V98H198V198H102V98H2Z"/><path d="m58 36-18 14 18 14m184-28 18 14-18 14m-106 85 14 18 14-18"/></svg>`
          : `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">${PATHS[id]}</svg>`;
      this.stage.append(target);
      this.targets.set(id, target);
      target.addEventListener(
        "pointerdown",
        (event) => this.startDrag(event, id),
        { signal: this.abort.signal },
      );
      target.addEventListener("pointermove", (event) => this.moveDrag(event), {
        signal: this.abort.signal,
      });
      target.addEventListener(
        "pointerup",
        (event) => this.endDrag(event, false),
        { signal: this.abort.signal },
      );
      target.addEventListener(
        "pointercancel",
        (event) => this.endDrag(event, true),
        { signal: this.abort.signal },
      );
      target.addEventListener(
        "lostpointercapture",
        (event) => this.endDrag(event, true),
        { signal: this.abort.signal },
      );
      target.addEventListener("focus", () => this.select(id), {
        signal: this.abort.signal,
      });
    }
    root.append(this.wrapper);
    this.wrapper
      .querySelector('[data-editor-action="cancel"]')!
      .addEventListener("click", () => this.cancel(), {
        signal: this.abort.signal,
      });
    this.wrapper.querySelector('[data-editor-action="done"]')!.addEventListener(
      "click",
      () => {
        this.rollbackDrag();
        const result = structuredClone(this.settings);
        this.destroy();
        this.callbacks.onSave(result);
      },
      { signal: this.abort.signal },
    );
    this.wrapper
      .querySelector('[data-editor-action="reset"]')!
      .addEventListener(
        "click",
        () => {
          this.rollbackDrag();
          this.settings.gamepadLayouts[this.orientation] = {};
          this.render();
          this.updateFields();
        },
        { signal: this.abort.signal },
      );
    this.sizeInput.addEventListener(
      "input",
      () => this.adjust("size", this.sizeInput.valueAsNumber),
      { signal: this.abort.signal },
    );
    this.opacityInput.addEventListener(
      "input",
      () => this.adjust("opacity", this.opacityInput.valueAsNumber),
      { signal: this.abort.signal },
    );
    window.addEventListener("keydown", (event) => this.onKey(event), {
      capture: true,
      signal: this.abort.signal,
    });
    window.addEventListener("blur", () => this.rollbackDrag(), {
      signal: this.abort.signal,
    });
    this.observer = new ResizeObserver(() => {
      const next = this.readOrientation();
      if (next !== this.orientation) {
        this.rollbackDrag();
        this.orientation = next;
      }
      this.render();
      this.updateFields();
    });
    this.observer.observe(this.stage);
    this.render();
    this.updateFields();
    this.targets.get("pad")!.focus({ preventScroll: true });
  }

  cancel(): void {
    if (this.destroyed) return;
    this.destroy();
    this.callbacks.onCancel();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.drag = null;
    this.abort.abort();
    this.observer.disconnect();
    this.wrapper.remove();
    if (
      this.previousFocus instanceof HTMLElement &&
      this.previousFocus.isConnected &&
      !this.previousFocus.closest("[inert]")
    ) {
      this.previousFocus.focus({ preventScroll: true });
    }
  }

  private readOrientation(): ControlOrientation {
    return window.innerWidth > window.innerHeight ? "landscape" : "portrait";
  }

  private geometry() {
    return computeControlGeometry(
      this.stage.clientWidth,
      this.stage.clientHeight,
      this.settings,
      this.orientation,
    );
  }

  private placement(id: GamepadControlId): GamepadControlPlacement {
    const saved = this.settings.gamepadLayouts[this.orientation][id];
    const geometry = this.geometry();
    const rect = geometry.groups![id];
    return {
      x: (rect.x + rect.width / 2) / geometry.width,
      y: (rect.y + rect.height / 2) / geometry.height,
      size: saved?.size ?? 1,
      opacity: saved?.opacity ?? this.settings.controlOpacity,
    };
  }

  private select(id: GamepadControlId): void {
    this.selected = id;
    for (const [key, target] of this.targets)
      target.setAttribute("aria-pressed", String(key === id));
    this.updateFields();
  }

  private updateFields(): void {
    const placement = this.placement(this.selected);
    this.selectionLabel.textContent = NAMES[this.selected];
    this.orientationLabel.textContent =
      this.orientation === "portrait" ? "Portrait" : "Landscape";
    this.sizeInput.value = String(placement.size);
    this.opacityInput.value = String(placement.opacity);
    this.sizeInput.setAttribute("aria-label", `${NAMES[this.selected]} size`);
    this.opacityInput.setAttribute(
      "aria-label",
      `${NAMES[this.selected]} opacity`,
    );
  }

  private render(): void {
    const geometry = this.geometry();
    for (const [id, target] of this.targets) {
      const rect = geometry.groups![id];
      Object.assign(target.style, {
        left: `${rect.x}px`,
        top: `${rect.y}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      });
      target.style.setProperty(
        "--editor-control-opacity",
        String(geometry.groupOpacity![id]),
      );
    }
  }

  private adjust(field: "size" | "opacity", value: number): void {
    this.rollbackDrag();
    this.settings.gamepadLayouts[this.orientation][this.selected] = {
      ...this.placement(this.selected),
      [field]: value,
    };
    this.render();
  }

  private startDrag(event: PointerEvent, id: GamepadControlId): void {
    if (event.button !== 0 || this.drag) return;
    event.preventDefault();
    this.select(id);
    this.targets.get(id)!.focus({ preventScroll: true });
    const placement = this.placement(id);
    this.drag = {
      id,
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      centerX: placement.x,
      centerY: placement.y,
      previous: this.settings.gamepadLayouts[this.orientation][id],
      orientation: this.orientation,
    };
    this.targets.get(id)!.setPointerCapture(event.pointerId);
  }

  private moveDrag(event: PointerEvent): void {
    if (!this.drag || event.pointerId !== this.drag.pointer) return;
    const drag = this.drag;
    const current = this.placement(drag.id);
    this.settings.gamepadLayouts[this.orientation][drag.id] = {
      ...current,
      x: drag.centerX + (event.clientX - drag.x) / this.stage.clientWidth,
      y: drag.centerY + (event.clientY - drag.y) / this.stage.clientHeight,
    };
    this.render();
    // Persist the resolved bounds/collision position, never the off-stage request.
    this.settings.gamepadLayouts[this.orientation][drag.id] = this.placement(
      drag.id,
    );
  }

  private endDrag(event: PointerEvent, cancelled: boolean): void {
    if (!this.drag || event.pointerId !== this.drag.pointer) return;
    if (cancelled) this.rollbackDrag();
    else this.drag = null;
  }

  private rollbackDrag(): void {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;
    const map = this.settings.gamepadLayouts[drag.orientation];
    if (drag.previous) map[drag.id] = drag.previous;
    else delete map[drag.id];
    const target = this.targets.get(drag.id)!;
    if (target.hasPointerCapture(drag.pointer))
      target.releasePointerCapture(drag.pointer);
    this.render();
  }

  private onKey(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.stopPropagation();
      event.preventDefault();
      this.cancel();
      return;
    }
    if (event.key === "Tab") {
      event.stopPropagation();
      const focusable = [
        ...this.wrapper.querySelectorAll<HTMLElement>("button, input"),
      ];
      const index = focusable.indexOf(document.activeElement as HTMLElement);
      const next = event.shiftKey
        ? (index - 1 + focusable.length) % focusable.length
        : (index + 1) % focusable.length;
      event.preventDefault();
      focusable[next]!.focus({ preventScroll: true });
      return;
    }
    if (event.code === "KeyP") {
      event.stopPropagation();
      return;
    }
    if (
      !(document.activeElement instanceof HTMLElement) ||
      !document.activeElement.dataset.editorControl
    )
      return;
    const directions: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const direction = directions[event.key];
    if (!direction) return;
    event.stopPropagation();
    event.preventDefault();
    const placement = this.placement(this.selected);
    const step = event.shiftKey ? 16 : 4;
    this.settings.gamepadLayouts[this.orientation][this.selected] = {
      ...placement,
      x: placement.x + (direction[0] * step) / this.stage.clientWidth,
      y: placement.y + (direction[1] * step) / this.stage.clientHeight,
    };
    this.render();
    this.settings.gamepadLayouts[this.orientation][this.selected] =
      this.placement(this.selected);
  }
}
