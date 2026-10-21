import type { GameCommand, UserSettings } from "../contracts/game-contract";

type Direction = "MOVE_LEFT" | "MOVE_RIGHT";
interface Held {
  direction: Direction;
  until: number;
}

/** One repeat clock shared by pointer and keyboard inputs; releasing any source is isolated. */
export class TouchControls {
  private root: HTMLElement;
  private command: (command: GameCommand) => void;
  private settings: () => UserSettings;
  private enabled: () => boolean;
  private pause: (key: "pause" | "back") => void;
  private held = new Map<string, Held>();
  private soft = new Set<string>();
  private activeActions = new Map<string, string>();
  private buttons = new Map<string, HTMLButtonElement>();
  private padPointers = new Map<number, string | null>();
  private disposers: (() => void)[] = [];
  private gesture: { id: number; x: number; y: number; at: number } | null =
    null;
  constructor(
    root: HTMLElement,
    command: (command: GameCommand) => void,
    settings: () => UserSettings,
    enabled: () => boolean,
    pause: (key: "pause" | "back") => void,
  ) {
    this.root = root;
    this.command = command;
    this.settings = settings;
    this.enabled = enabled;
    this.pause = pause;
    this.listen(window, "keydown", this.keydown as EventListener);
    this.listen(window, "keyup", this.keyup as EventListener);
    this.listen(window, "blur", () => this.releaseAll());
    if (typeof document !== "undefined")
      this.listen(document, "visibilitychange", () => {
        if (document.hidden) this.releaseAll();
      });
    const movementPad = root.querySelector<HTMLElement>("[data-movement-pad]");
    const usesPad = () =>
      this.settings().controlLayout === "gamepad" && movementPad !== null;
    root
      .querySelectorAll<HTMLButtonElement>("[data-command]")
      .forEach((button) => {
        this.buttons.set(button.dataset.command!, button);
        this.listen(button, "pointerdown", ((event: PointerEvent) => {
          if (usesPad() && movementPad!.contains(button)) return;
          if (!this.enabled()) return;
          event.preventDefault();
          button.setPointerCapture(event.pointerId);
          this.press(`pointer-${event.pointerId}`, button.dataset.command!);
        }) as EventListener);
        const release = ((event: PointerEvent) => {
          this.release(`pointer-${event.pointerId}`);
        }) as EventListener;
        ["pointerup", "pointercancel", "lostpointercapture"].forEach((type) =>
          this.listen(button, type, release),
        );
        // Keyboard activation and assistive technology produce clicks without a pointerdown.
        this.listen(button, "click", ((event: MouseEvent) => {
          if (event.detail === 0 && this.enabled()) {
            const id = `accessible-${button.dataset.command}`;
            this.press(id, button.dataset.command!);
            this.release(id);
          }
        }) as EventListener);
      });
    if (movementPad) {
      const updatePad = (event: PointerEvent) => {
        const id = `pointer-${event.pointerId}`;
        let action: string | null = null;
        if (this.enabled() && usesPad()) {
          for (const direction of ["MOVE_LEFT", "MOVE_RIGHT", "SOFT_DROP"]) {
            const button = this.buttons.get(direction);
            if (!button || !movementPad.contains(button)) continue;
            const bounds = button.getBoundingClientRect();
            if (
              event.clientX >= bounds.left &&
              event.clientX < bounds.right &&
              event.clientY >= bounds.top &&
              event.clientY < bounds.bottom
            ) {
              action = direction;
              break;
            }
          }
        }
        if (this.padPointers.get(event.pointerId) === action) return;
        this.release(id);
        this.padPointers.set(event.pointerId, action);
        if (action) this.press(id, action);
      };
      this.listen(movementPad, "pointerdown", ((event: PointerEvent) => {
        if (!usesPad() || !this.enabled()) return;
        event.preventDefault();
        movementPad.setPointerCapture(event.pointerId);
        this.padPointers.set(event.pointerId, null);
        updatePad(event);
      }) as EventListener);
      this.listen(movementPad, "pointermove", ((event: PointerEvent) => {
        if (!this.padPointers.has(event.pointerId)) return;
        event.preventDefault();
        updatePad(event);
      }) as EventListener);
      const releasePad = ((event: PointerEvent) => {
        if (!this.padPointers.delete(event.pointerId)) return;
        this.release(`pointer-${event.pointerId}`);
      }) as EventListener;
      ["pointerup", "pointercancel", "lostpointercapture"].forEach((type) =>
        this.listen(movementPad, type, releasePad),
      );
    }
    const canvas = root.querySelector<HTMLCanvasElement>("#board")!;
    this.listen(canvas, "pointerdown", ((event: PointerEvent) => {
      if (!this.enabled() || this.settings().controlScheme !== "hybrid") return;
      canvas.setPointerCapture(event.pointerId);
      this.gesture = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        at: performance.now(),
      };
    }) as EventListener);
    this.listen(canvas, "pointerup", ((event: PointerEvent) => {
      const start = this.gesture;
      this.gesture = null;
      if (!start || start.id !== event.pointerId || !this.enabled()) return;
      const dx = event.clientX - start.x,
        dy = event.clientY - start.y;
      if (Math.abs(dx) > Math.max(24, Math.abs(dy))) {
        const steps = Math.min(
          10,
          Math.max(1, Math.round(Math.abs(dx) / (canvas.clientWidth / 10))),
        );
        for (let i = 0; i < steps; i++)
          this.command({ type: dx < 0 ? "MOVE_LEFT" : "MOVE_RIGHT" });
      } else if (dy > 35) this.command({ type: "HARD_DROP" });
      else if (dy < -35) this.command({ type: "HOLD" });
      else if (performance.now() - start.at < 400)
        this.command({ type: "ROTATE_CW" });
    }) as EventListener);
    this.listen(canvas, "pointercancel", () => {
      this.gesture = null;
    });
    this.listen(canvas, "lostpointercapture", () => {
      this.gesture = null;
    });
  }
  private listen(target: EventTarget, type: string, handler: EventListener) {
    target.addEventListener(type, handler);
    this.disposers.push(() => target.removeEventListener(type, handler));
  }
  private keydown = (event: KeyboardEvent) => {
    if (
      (event.target as HTMLElement)?.matches?.(
        "input,select,textarea,button",
      ) &&
      event.code !== "Escape" &&
      event.code !== "KeyP"
    )
      return;
    if (["Escape", "KeyP"].includes(event.code)) {
      if (!event.repeat) this.pause(event.code === "KeyP" ? "pause" : "back");
      event.preventDefault();
      return;
    }
    const keys: Record<string, string> = {
      ArrowLeft: "MOVE_LEFT",
      ArrowRight: "MOVE_RIGHT",
      ArrowDown: "SOFT_DROP",
      ArrowUp: "ROTATE_CW",
      KeyX: "ROTATE_CW",
      KeyZ: "ROTATE_CCW",
      KeyC: "HOLD",
      ShiftLeft: "HOLD",
      Space: "HARD_DROP",
    };
    const action = keys[event.code];
    if (action && this.enabled()) {
      event.preventDefault();
      if (!event.repeat) this.press(event.code, action);
    }
  };
  private keyup = (event: KeyboardEvent) => {
    this.release(event.code);
  };
  private press(id: string, action: string) {
    this.activeActions.set(id, action);
    this.refreshPressed(action);
    if (action === "MOVE_LEFT" || action === "MOVE_RIGHT") {
      if (this.held.has(id)) return;
      const previous = this.winner();
      if (previous?.direction !== action) this.command({ type: action });
      this.held.set(id, {
        direction: action,
        until:
          previous?.direction === action
            ? previous.until
            : performance.now() + this.settings().dasMs,
      });
    } else if (action === "SOFT_DROP") {
      this.soft.add(id);
      this.command({ type: "SOFT_DROP", active: true });
    } else if (
      ["ROTATE_CW", "ROTATE_CCW", "HARD_DROP", "HOLD"].includes(action)
    )
      this.command({ type: action } as GameCommand);
  }
  private release(id: string) {
    const action = this.activeActions.get(id);
    this.activeActions.delete(id);
    if (action) this.refreshPressed(action);
    this.held.delete(id);
    if (this.soft.delete(id) && this.soft.size === 0)
      this.command({ type: "SOFT_DROP", active: false });
  }
  private refreshPressed(action: string) {
    const button = this.buttons.get(action);
    if (Array.from(this.activeActions.values()).includes(action))
      button?.classList.add("pressed");
    else button?.classList.remove("pressed");
  }
  update(now: number) {
    if (!this.enabled()) {
      this.releaseAll();
      return;
    }
    const held = this.winner();
    if (held && now >= held.until) {
      this.command({ type: held.direction });
      const until = now + Math.max(16, this.settings().arrMs);
      // Sources holding the same direction share one repeat clock.
      for (const source of this.held.values())
        if (source.direction === held.direction) source.until = until;
    }
  }
  private winner() {
    return Array.from(this.held.values()).at(-1);
  }
  /** A swipe belongs to the piece that was on screen when it began. Physical holds persist. */
  pieceChanged() {
    this.gesture = null;
  }
  releaseAll() {
    this.held.clear();
    this.padPointers.clear();
    this.activeActions.clear();
    this.gesture = null;
    if (this.soft.size) {
      this.soft.clear();
      this.command({ type: "SOFT_DROP", active: false });
    }
    this.root
      .querySelectorAll(".pressed")
      .forEach((button) => button.classList.remove("pressed"));
  }
  destroy() {
    this.releaseAll();
    this.disposers.forEach((dispose) => dispose());
  }
}
