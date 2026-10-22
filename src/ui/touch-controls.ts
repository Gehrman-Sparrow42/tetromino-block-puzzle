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
  private restorePad: (() => void) | null = null;
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
    this.listen(window, "resize", () => this.releaseAll());
    if (typeof document !== "undefined")
      this.listen(document, "visibilitychange", () => {
        if (document.hidden) this.releaseAll();
      });
    root
      .querySelectorAll<HTMLButtonElement>("[data-command]")
      .forEach((button) => {
        this.buttons.set(button.dataset.command!, button);
        this.listen(button, "pointerdown", ((event: PointerEvent) => {
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
    const area = root.querySelector<HTMLElement>(".play-area");
    const homes = new Map<HTMLElement, { left: string; top: string }>();
    if (area)
      this.listen(area, "pointerdown", ((event: PointerEvent) => {
        if (!this.enabled() || this.settings().padMode !== "dynamic") return;
        const target = event.target as Element;
        if (target.closest("button, #board, .left-rail, .next-rail")) return;
        const groups = [
          "MOVE_LEFT",
          "SOFT_DROP",
          "MOVE_RIGHT",
          "HARD_DROP",
          "HOLD",
          "ROTATE_CW",
          "ROTATE_CCW",
        ]
          .map((action) => ({ node: this.buttons.get(action), action }))
          .filter((item) => item.node && !item.node.hidden)
          .map((item) => ({ nodes: [item.node!], actions: [item.action] }));
        if (!groups.length) return;
        const bounds = (nodes: HTMLElement[]) => {
          const rs = nodes.map((n) => n.getBoundingClientRect());
          const left = Math.min(...rs.map((r) => r.left)),
            top = Math.min(...rs.map((r) => r.top));
          return {
            left,
            top,
            width: Math.max(...rs.map((r) => r.right)) - left,
            height: Math.max(...rs.map((r) => r.bottom)) - top,
          };
        };
        groups.sort((a, b) => {
          const distance = (g: typeof a) => {
            const r = bounds(g.nodes);
            return Math.hypot(
              event.clientX - r.left - r.width / 2,
              event.clientY - r.top - r.height / 2,
            );
          };
          return distance(a) - distance(b);
        });
        const group = groups[0]!;
        if (
          [...this.activeActions.values()].some((a) =>
            group.actions.includes(a),
          )
        )
          return;
        const r = bounds(group.nodes),
          viewport = area.getBoundingClientRect();
        if (r.width > viewport.width || r.height > viewport.height) return;
        const left = Math.max(
          viewport.left,
          Math.min(viewport.right - r.width, event.clientX - r.width / 2),
        );
        const top = Math.max(
          viewport.top,
          Math.min(viewport.bottom - r.height, event.clientY - r.height / 4),
        );
        const dx = left - r.left,
          dy = top - r.top;
        const members = group.actions.map((a) => this.buttons.get(a)!);
        const obstacles = [
          ...root.querySelectorAll<HTMLElement>(
            "#board, .left-rail, .next-rail",
          ),
        ].filter((n) => !members.includes(n as HTMLButtonElement));
        const proposed = group.nodes.map((n) => {
          const q = n.getBoundingClientRect();
          return {
            left: q.left + dx,
            top: q.top + dy,
            right: q.right + dx,
            bottom: q.bottom + dy,
          };
        });
        if (
          obstacles.some((n) => {
            const q = n.getBoundingClientRect();
            return (
              q.width &&
              q.height &&
              proposed.some(
                (p) =>
                  p.left < q.right + 8 &&
                  p.right + 8 > q.left &&
                  p.top < q.bottom + 8 &&
                  p.bottom + 8 > q.top,
              )
            );
          })
        )
          return;
        event.preventDefault();
        for (const node of group.nodes) {
          if (!homes.has(node))
            homes.set(node, { left: node.style.left, top: node.style.top });
          node.style.left = `${parseFloat(node.style.left) + dx}px`;
          node.style.top = `${parseFloat(node.style.top) + dy}px`;
        }
        this.restorePad = () => {
          for (const [node, home] of homes) {
            node.style.left = home.left;
            node.style.top = home.top;
          }
          homes.clear();
        };
      }) as EventListener);
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
    this.restorePad?.();
    this.restorePad = null;
    this.held.clear();
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
