import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import type { UserSettings } from "../contracts/game-contract";

export function pulseHaptic(
  kind: "light" | "clear",
  settings: UserSettings,
): void {
  if (!settings.hapticsEnabled) return;
  try {
    if (Capacitor.isNativePlatform()) {
      void Haptics.impact({
        style: kind === "clear" ? ImpactStyle.Medium : ImpactStyle.Light,
      }).catch(() => {});
    } else if (
      typeof navigator !== "undefined" &&
      typeof navigator.vibrate === "function"
    ) {
      navigator.vibrate(kind === "clear" ? [15, 25, 15] : 8);
    }
  } catch {
    /* Some devices and browser policies do not support haptics. */
  }
}
