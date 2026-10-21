import type { ControlOrientation } from "../contracts/game-contract";

export interface ControlViewport {
  width: number;
  height: number;
  orientation: ControlOrientation;
}

/** Measure the real play area, including when Settings was opened from Home. */
export function measureControlViewport(game: HTMLElement): ControlViewport {
  const hidden = game.getAttribute("hidden");
  const style = game.getAttribute("style");
  try {
    if (game.hidden) {
      game.style.visibility = "hidden";
      game.hidden = false;
    }
    const area = game.querySelector<HTMLElement>(".play-area")!;
    return {
      width: area.clientWidth,
      height: area.clientHeight,
      orientation: innerWidth > innerHeight ? "landscape" : "portrait",
    };
  } finally {
    if (hidden === null) game.removeAttribute("hidden");
    else game.setAttribute("hidden", hidden);
    if (style === null) game.removeAttribute("style");
    else game.setAttribute("style", style);
  }
}
