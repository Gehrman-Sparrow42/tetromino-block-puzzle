export interface RewardedAdDriver {
  /** Resolves only after the fullscreen ad closes. true requires the SDK earned-reward event. */
  show(options: { customData: string; signal: AbortSignal }): Promise<boolean>;
}
export interface RewardedAds {
  readonly enabled: boolean;
  readonly isTest: boolean;
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
    panel.setAttribute("aria-label", "Test ad");
    panel.style.cssText =
      "position:fixed;inset:8px auto auto 8px;margin:0;z-index:1000;max-width:340px;width:calc(100vw - 16px);color:var(--text);background:var(--surface);";
    const title = document.createElement("h2");
    title.textContent = "Test ad";
    const note = document.createElement("p");
    note.textContent = "Preview only. No real ad is loaded.";
    const complete = document.createElement("button");
    complete.className = "primary-button";
    complete.textContent = "Complete test ad";
    const cancel = document.createElement("button");
    cancel.className = "secondary-button";
    cancel.textContent = "Cancel test ad";
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
    return {
      enabled: true,
      isTest: true,
      requestContinue: (_runId, signal) => testReward(signal),
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
  let earnedAttempt: { runId: string; id: string; token: string } | undefined;
  return {
    enabled,
    isTest: false,
    async requestContinue(runId, signal) {
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
      if (earnedAttempt?.runId !== runId) {
        earnedAttempt = undefined;
        const attempt = await request(
          "/v1/rewards/attempts",
          "POST",
          undefined,
          { runId },
        );
        const id = attempt.id,
          token = attempt.token;
        if (
          typeof id !== "string" ||
          !/^[A-Za-z0-9_-]{32}$/.test(id) ||
          typeof token !== "string" ||
          !/^[A-Za-z0-9_-]{43}$/.test(token) ||
          attempt.rows !== 2
        )
          throw new Error("Invalid reward offer.");
        if (!(await driver.show({ customData: id, signal })))
          return { earned: false };
        earnedAttempt = { runId, id, token };
      }
      const { id, token } = earnedAttempt;
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
            receipt.rows !== 2 ||
            receipt.runId !== runId
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
      throw new Error("Reward confirmation timed out. No rows were changed.");
    },
  };
}
