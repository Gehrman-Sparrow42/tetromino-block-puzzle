import { afterEach, expect, it, vi } from "vitest";
import { createRewardedAds, registerRewardedAdDriver } from "./rewarded-ads";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("retries an earned reward after a lost claim response without creating an attempt or showing another ad", async () => {
  vi.stubGlobal("location", { href: "http://localhost/" });
  vi.stubEnv("VITE_REWARDED_ADS_ENABLED", "true");
  vi.stubEnv("VITE_REWARDS_API_URL", "https://rewards.example");
  const show = vi.fn(async () => true),
    unregister = registerRewardedAdDriver({ show });
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "a".repeat(32),
        token: "b".repeat(43),
        rows: 2,
      }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "verified" }),
    })
    .mockRejectedValueOnce(new Error("Claim response lost"))
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "claimed" }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "claimed", rows: 2, runId: "run" }),
    });
  vi.stubGlobal("fetch", fetcher);
  try {
    const provider = createRewardedAds();
    await expect(
      provider.requestContinue("run", new AbortController().signal),
    ).rejects.toThrow("lost");
    expect(
      await provider.requestContinue("run", new AbortController().signal),
    ).toEqual({ earned: true });
    expect(show).toHaveBeenCalledTimes(1);
    expect(
      fetcher.mock.calls.filter(([url]) => String(url).endsWith("/attempts")),
    ).toHaveLength(1);
  } finally {
    unregister();
  }
});
it("does not offer ads, request network access or load an SDK by default", () => {
  vi.stubGlobal("location", { href: "http://localhost/" });
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  expect(createRewardedAds().enabled).toBe(false);
  expect(fetcher).not.toHaveBeenCalled();
});
it("requires HTTPS and a registered driver before enabling production rewards", () => {
  vi.stubGlobal("location", { href: "http://localhost/" });
  vi.stubEnv("VITE_REWARDED_ADS_ENABLED", "true");
  vi.stubEnv("VITE_REWARDS_API_URL", "http://public.example");
  const unregister = registerRewardedAdDriver({ show: async () => true });
  expect(createRewardedAds().enabled).toBe(false);
  vi.stubEnv("VITE_REWARDS_API_URL", "https://rewards.example");
  expect(createRewardedAds().enabled).toBe(true);
  unregister();
  expect(createRewardedAds().enabled).toBe(false);
});
it("waits for SDK earning plus server verification and an authenticated two-row receipt", async () => {
  vi.stubGlobal("location", { href: "http://localhost/" });
  vi.stubEnv("VITE_REWARDED_ADS_ENABLED", "true");
  vi.stubEnv("VITE_REWARDS_API_URL", "https://rewards.example");
  const show = vi.fn(async () => true);
  const unregister = registerRewardedAdDriver({ show });
  const id = "a".repeat(32),
    token = "b".repeat(43);
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id, token, rows: 2 }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "verified" }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "claimed", rows: 2, runId: "run" }),
    });
  vi.stubGlobal("fetch", fetcher);
  try {
    expect(
      await createRewardedAds().requestContinue(
        "run",
        new AbortController().signal,
      ),
    ).toEqual({ earned: true });
    expect(show).toHaveBeenCalledWith({
      customData: id,
      signal: expect.any(AbortSignal),
    });
    expect(fetcher.mock.calls[2][1].headers.Authorization).toBe(
      `Bearer ${token}`,
    );
  } finally {
    unregister();
  }
});
it("never redeems an ad dismissed without earning", async () => {
  vi.stubGlobal("location", { href: "http://localhost/" });
  vi.stubEnv("VITE_REWARDED_ADS_ENABLED", "true");
  vi.stubEnv("VITE_REWARDS_API_URL", "https://rewards.example");
  const unregister = registerRewardedAdDriver({ show: async () => false });
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      id: "a".repeat(32),
      token: "b".repeat(43),
      rows: 2,
    }),
  });
  vi.stubGlobal("fetch", fetcher);
  try {
    expect(
      await createRewardedAds().requestContinue(
        "run",
        new AbortController().signal,
      ),
    ).toEqual({ earned: false });
    expect(fetcher).toHaveBeenCalledTimes(1);
  } finally {
    unregister();
  }
});

it("binds theme receipts to exact placement, profile and theme; retries earned impressions after cancellation", async () => {
  vi.stubGlobal("location", { href: "http://localhost/" });
  vi.stubEnv("VITE_REWARDED_ADS_ENABLED", "true");
  vi.stubEnv("VITE_REWARDS_API_URL", "https://rewards.example");
  const show = vi.fn(async () => true);
  const unregister = registerRewardedAdDriver({ show });
  const offer = {
    id: "a".repeat(32),
    token: "b".repeat(43),
    placement: "theme",
    profileId: "profile",
    themeId: "neon",
  };
  const response = (value: unknown) => ({ ok: true, json: async () => value });
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response(offer))
    .mockRejectedValueOnce(new DOMException("Aborted", "AbortError"));
  vi.stubGlobal("fetch", fetcher);
  const provider = createRewardedAds();
  try {
    await expect(
      provider.requestThemeUnlock(
        "profile",
        "neon",
        new AbortController().signal,
      ),
    ).rejects.toThrow("Aborted");
    for (const receipt of [
      { status: "claimed", rows: 2, runId: "profile" },
      {
        status: "claimed",
        placement: "theme",
        profileId: "other",
        themeId: "neon",
      },
      {
        status: "claimed",
        placement: "theme",
        profileId: "profile",
        themeId: "ocean",
      },
    ]) {
      fetcher
        .mockResolvedValueOnce(response({ status: "verified" }))
        .mockResolvedValueOnce(response(receipt));
      await expect(
        provider.requestThemeUnlock(
          "profile",
          "neon",
          new AbortController().signal,
        ),
      ).rejects.toThrow("Invalid reward receipt");
    }
    fetcher
      .mockResolvedValueOnce(response({ status: "verified" }))
      .mockResolvedValueOnce(
        response({
          status: "claimed",
          placement: "theme",
          profileId: "profile",
          themeId: "neon",
        }),
      );
    await expect(
      provider.requestThemeUnlock(
        "profile",
        "neon",
        new AbortController().signal,
      ),
    ).resolves.toEqual({ earned: true });
    expect(show).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
      placement: "theme",
      profileId: "profile",
      themeId: "neon",
    });
  } finally {
    unregister();
  }
});
