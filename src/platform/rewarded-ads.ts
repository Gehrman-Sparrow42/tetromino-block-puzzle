import {
  isThemeId,
  isStarterTheme,
  type ThemeId,
} from "../contracts/theme-catalog";
import { t } from "./i18n";
export interface RewardedAdDriver {
  /** Resolves only after the fullscreen ad closes. true requires the SDK earned-reward event. */
  show(options: { customData: string; signal: AbortSignal }): Promise<boolean>;
}
export interface RewardedAds {
  readonly enabled: boolean;
  readonly isTest: boolean;
  requestThemeUnlock(
    profileId: string,
    themeId: ThemeId,
    signal: AbortSignal,
  ): Promise<{ earned: boolean }>;
  requestContinue(
    runId: string,
    signal: AbortSignal,
  ): Promise<{ earned: boolean }>;
}

let nativeDriver: RewardedAdDriver | undefined;
/** Register a consent-aware native SDK adapter before startApp. No SDK is initialized here. */
export function registerRewardedAdDriver(driver: RewardedAdDriver): () => void {
  nativeDriver = driver;
  return () => {
    if (nativeDriver === driver) nativeDriver = undefined;
  };
}

function testReward(signal: AbortSignal): Promise<{ earned: boolean }> {
  return new Promise((resolve) => {
    const panel = document.createElement("dialog");
    panel.className = "sheet";
    panel.setAttribute("aria-label", t("Test ad"));
    panel.style.cssText =
      "position:fixed;inset:8px auto auto 8px;margin:0;z-index:1000;max-width:340px;width:calc(100vw - 16px);color:var(--text);background:var(--surface);";
    const title = document.createElement("h2");
    title.textContent = t("Test ad");
    const note = document.createElement("p");
    note.textContent = t("Preview only. No real ad is loaded.");
    const complete = document.createElement("button");
    complete.className = "primary-button";
    complete.textContent = t("Complete test ad");
    const cancel = document.createElement("button");
    cancel.className = "secondary-button";
    cancel.textContent = t("Cancel test ad");
    let settled = false;
    const finish = (earned: boolean) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abort);
      panel.close();
      panel.remove();
      resolve({ earned });
    };
    const abort = () => finish(false);
    complete.onclick = () => finish(true);
    cancel.onclick = abort;
    panel.addEventListener("cancel", (event) => {
      event.preventDefault();
      abort();
    });
    panel.append(title, note, complete, cancel);
    document.body.append(panel);
    if (signal.aborted) abort();
    else {
      signal.addEventListener("abort", abort, { once: true });
      panel.show();
    }
  });
}

export function createRewardedAds(): RewardedAds {
  // DEV is replaced at build time. URL flags cannot enable test rewards in a release HTML/APK.
  if (
    import.meta.env.DEV &&
    new URL(location.href).searchParams.get("rewardedAds") === "test"
  ) {
    let previewBusy = false;
    const preview = async (signal: AbortSignal) => {
      if (previewBusy) throw new Error("A rewarded ad is already in progress.");
      previewBusy = true;
      try {
        return await testReward(signal);
      } finally {
        previewBusy = false;
      }
    };
    return {
      enabled: true,
      isTest: true,
      requestContinue: (_runId, signal) => preview(signal),
      requestThemeUnlock: (_profileId, _themeId, signal) => preview(signal),
    };
  }
  const base = import.meta.env.VITE_REWARDS_API_URL as string | undefined;
  let api: URL | undefined;
  try {
    if (base) {
      const candidate = new URL(base);
      if (
        candidate.protocol === "https:" &&
        !candidate.username &&
        !candidate.password &&
        !candidate.search &&
        !candidate.hash
      )
        api = candidate;
    }
  } catch {
    /* Disabled until configured. */
  }
  const enabled =
    import.meta.env.VITE_REWARDED_ADS_ENABLED === "true" &&
    !!api &&
    !!nativeDriver;
  const driver = nativeDriver;
  // Keep the receipt credentials when SSV is delayed or a claim response is lost.
  // A retry must redeem the same earned impression, not ask for another ad.
  const earnedAttempts = new Map<string, { id: string; token: string }>();
  let busy = false;
  async function perform(
    target:
      | { placement: "continue"; runId: string }
      | { placement: "theme"; profileId: string; themeId: ThemeId },
    signal: AbortSignal,
  ) {
    if (busy) throw new Error("A rewarded ad is already in progress.");
    busy = true;
    const scope = JSON.stringify(target);
    try {
      if (!enabled || !api || !driver)
        throw new Error("Rewarded ads are not configured.");
      const request = async (
        path: string,
        method: string,
        token?: string,
        body?: unknown,
      ) => {
        const response = await fetch(new URL(path, api), {
          method,
          signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
          credentials: "omit",
          headers: {
            ...(body ? { "Content-Type": "application/json" } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        if (!response.ok)
          throw new Error(
            "The reward service is unavailable. You can end this run or try again.",
          );
        return (await response.json()) as Record<string, unknown>;
      };
      signal.throwIfAborted();
      if (!earnedAttempts.has(scope)) {
        const attempt = await request(
          "/v1/rewards/attempts",
          "POST",
          undefined,
          target.placement === "continue" ? { runId: target.runId } : target,
        );
        const id = attempt.id,
          token = attempt.token;
        if (
          typeof id !== "string" ||
          !/^[A-Za-z0-9_-]{32}$/.test(id) ||
          typeof token !== "string" ||
          !/^[A-Za-z0-9_-]{43}$/.test(token) ||
          (target.placement === "continue"
            ? attempt.rows !== 2
            : attempt.placement !== "theme" ||
              attempt.profileId !== target.profileId ||
              attempt.themeId !== target.themeId)
        )
          throw new Error("Invalid reward offer.");
        if (!(await driver.show({ customData: id, signal })))
          return { earned: false };
        earnedAttempts.set(scope, { id, token });
      }
      const { id, token } = earnedAttempts.get(scope)!;
      // SSV may arrive after the SDK event. Never turn an ad dismissal into a reward.
      const deadline = Date.now() + 60_000;
      while (!signal.aborted && Date.now() < deadline) {
        const status = await request(
          `/v1/rewards/attempts/${id}`,
          "GET",
          token,
        );
        if (status.status === "verified" || status.status === "claimed") {
          const receipt = await request(
            `/v1/rewards/attempts/${id}/claim`,
            "POST",
            token,
          );
          if (
            receipt.status !== "claimed" ||
            (target.placement === "continue"
              ? (receipt.placement !== undefined &&
                  receipt.placement !== "continue") ||
                receipt.rows !== 2 ||
                receipt.runId !== target.runId
              : receipt.placement !== "theme" ||
                receipt.profileId !== target.profileId ||
                receipt.themeId !== target.themeId)
          )
            throw new Error("Invalid reward receipt.");
          return { earned: true };
        }
        if (status.status === "expired") break;
        await new Promise<void>((resolve, reject) => {
          const onAbort = () => {
            clearTimeout(timer);
            reject(new DOMException("Aborted", "AbortError"));
          };
          const timer = setTimeout(() => {
            signal.removeEventListener("abort", onAbort);
            resolve();
          }, 1000);
          signal.addEventListener("abort", onAbort, { once: true });
          if (signal.aborted) onAbort();
        });
      }
      throw new Error(
        "Reward confirmation timed out. Try again to check this reward.",
      );
    } finally {
      busy = false;
    }
  }
  return {
    enabled,
    isTest: false,
    requestContinue: (runId, signal) =>
      perform({ placement: "continue", runId }, signal),
    requestThemeUnlock: (profileId, themeId, signal) => {
      if (
        !/^[A-Za-z0-9_-]{1,128}$/.test(profileId) ||
        !isThemeId(themeId) ||
        isStarterTheme(themeId)
      )
        return Promise.reject(new Error("Invalid theme target."));
      return perform({ placement: "theme", profileId, themeId }, signal);
    },
  };
}
