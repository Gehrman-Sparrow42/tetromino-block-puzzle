import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

export async function setupLifecycle(callbacks: {
  onPause: () => void;
  onBack: () => void;
}): Promise<() => void> {
  const removers: (() => void)[] = [];
  let disposed = false;
  const pause = (): void => {
    if (!disposed) callbacks.onPause();
  };
  if (typeof document !== "undefined") {
    const onVisibility = (): void => {
      if (document.visibilityState !== "visible") pause();
    };
    document.addEventListener("visibilitychange", onVisibility);
    removers.push(() =>
      document.removeEventListener("visibilitychange", onVisibility),
    );
  }
  if (typeof window !== "undefined") {
    window.addEventListener("blur", pause);
    removers.push(() => window.removeEventListener("blur", pause));
  }
  try {
    if (Capacitor.isNativePlatform()) {
      try {
        const listener = await App.addListener(
          "appStateChange",
          ({ isActive }) => {
            if (!isActive) pause();
          },
        );
        removers.push(() => {
          void listener.remove().catch(() => {});
        });
      } catch {
        /* Browser listeners still provide a fallback. */
      }
      try {
        const listener = await App.addListener("backButton", () => {
          if (!disposed) callbacks.onBack();
        });
        removers.push(() => {
          void listener.remove().catch(() => {});
        });
      } catch {
        /* Optional plugin support must not stop app initialization. */
      }
    }
  } catch {
    /* Platform detection can fail in restricted hosts. */
  }
  return () => {
    disposed = true;
    for (const remove of removers.splice(0)) {
      try {
        remove();
      } catch {
        /* Continue cleaning up the remaining listeners. */
      }
    }
  };
}

export async function exitApp(): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) await App.exitApp();
  } catch {
    /* Unsupported outside Android. */
  }
}
