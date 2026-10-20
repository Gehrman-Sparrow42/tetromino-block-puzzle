import type { UserSettings } from "../contracts/game-contract";

type SoundKind = "move" | "rotate" | "drop" | "clear" | "level" | "over";
let context: AudioContext | undefined;
const tones: Record<SoundKind, [number, number, number]> = {
  move: [180, 130, 0.035],
  rotate: [320, 500, 0.055],
  drop: [180, 55, 0.13],
  clear: [520, 1050, 0.2],
  level: [650, 1500, 0.3],
  over: [300, 65, 0.5],
};

export function playSound(kind: SoundKind, settings: UserSettings): void {
  if (
    !settings.soundEnabled ||
    !Number.isFinite(settings.soundVolume) ||
    settings.soundVolume <= 0
  )
    return;
  try {
    if (!context) {
      if (typeof AudioContext === "undefined") return;
      context = new AudioContext();
    }
    const activeContext = context;
    const play = (): void => {
      try {
        if (activeContext.state !== "running") return;
        const [start, end, duration] = tones[kind];
        const oscillator = activeContext.createOscillator();
        const gain = activeContext.createGain();
        const now = activeContext.currentTime;
        oscillator.type =
          kind === "drop" || kind === "over" ? "triangle" : "sine";
        oscillator.frequency.setValueAtTime(start, now);
        oscillator.frequency.exponentialRampToValueAtTime(end, now + duration);
        gain.gain.setValueAtTime(Math.min(1, settings.soundVolume) * 0.13, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        oscillator.connect(gain);
        gain.connect(activeContext.destination);
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
        };
        oscillator.start(now);
        oscillator.stop(now + duration);
      } catch {
        /* Audio is optional, including when browser policy blocks it. */
      }
    };
    if (activeContext.state === "suspended")
      void activeContext
        .resume()
        .then(play)
        .catch(() => {});
    else play();
  } catch {
    /* Unavailable audio must never interrupt gameplay. */
  }
}
