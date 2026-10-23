import { afterEach, describe, expect, it } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { startRewardsServer } from "./http";
import { RewardStore } from "./store";
import { verifyAdmobCallback } from "./ssv";

const { publicKey, privateKey } = generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
});
const keys = async (id: string) => {
  if (id !== "7") throw new Error("Unknown key");
  return publicKey;
};
const unit = "test-reward-unit";
function callback(id: string, overrides: Record<string, string> = {}) {
  const signed = new URLSearchParams({
    ad_network: "test",
    ad_unit: unit,
    custom_data: id,
    reward_amount: "1",
    reward_item: "continue",
    timestamp: String(Date.now()),
    transaction_id: "transaction-1",
    user_id: "escaped + data",
    ...overrides,
  }).toString();
  return `${signed}&signature=${sign("sha256", Buffer.from(signed), privateKey).toString("base64url")}&key_id=7`;
}
const cleanup: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

describe("reward verification", () => {
  it("verifies original escaped bytes and rejects tampering, wrong units, stale/repeated fields and missing signatures", async () => {
    const id = "a".repeat(32),
      query = callback(id);
    expect(
      await verifyAdmobCallback(query, keys, new Set([unit])),
    ).toMatchObject({ attemptId: id, transactionId: "transaction-1" });
    for (const invalid of [
      query.replace("reward_amount=1", "reward_amount=2"),
      callback(id, { ad_unit: "another-unit" }),
      callback(id, { timestamp: "1" }),
      query.replace("&signature=", "&custom_data=other&signature="),
      query.split("&signature=")[0],
      callback(id, { reward_item: "cash" }),
    ]) {
      await expect(
        verifyAdmobCallback(invalid, keys, new Set([unit])),
      ).rejects.toThrow();
    }
    await expect(
      verifyAdmobCallback(
        query.replace("key_id=7", "key_id=8"),
        keys,
        new Set([unit]),
      ),
    ).rejects.toThrow();
  });

  it("persists one reward across restarts; duplicate callbacks/claims are idempotent and tokens stay scoped", () => {
    mkdirSync(resolve("artifacts/rewards-tests"), { recursive: true });
    const database = resolve("artifacts/rewards-tests/ledger.sqlite");
    const run = `run-${Date.now()}`;
    let store = new RewardStore(database);
    const attempt = store.create(run);
    expect(() => store.read(attempt.id, attempt.token, true)).toThrow(
      /verified/,
    );
    expect(store.read(attempt.id, "wrong")).toBeNull();
    const reward = {
      attemptId: attempt.id,
      transactionId: `transaction-${run}`,
      timestamp: Date.now(),
    };
    store.verify(reward);
    store.verify(reward);
    store.close();
    store = new RewardStore(database);
    cleanup.push(() => store.close());
    expect(store.read(attempt.id, attempt.token)).toMatchObject({
      status: "verified",
      rows: 2,
      runId: run,
    });
    expect(store.read(attempt.id, attempt.token, true)).toMatchObject({
      status: "claimed",
    });
    expect(store.read(attempt.id, attempt.token, true)).toMatchObject({
      status: "claimed",
    });
    expect(() => store.create(run)).toThrow(/already/);
    const other = store.create(`${run}-other`);
    expect(() => store.verify({ ...reward, attemptId: other.id })).toThrow(
      /used/,
    );
  });

  it("expires attempts and refuses a second grant from parallel attempts for the same run", () => {
    const store = new RewardStore(":memory:");
    cleanup.push(() => store.close());
    const a = store.create("same"),
      b = store.create("same");
    store.verify({
      attemptId: a.id,
      transactionId: "first",
      timestamp: Date.now(),
    });
    expect(() =>
      store.verify({
        attemptId: b.id,
        transactionId: "second",
        timestamp: Date.now(),
      }),
    ).toThrow(/already/);
    const old = store.create("expired", 1000);
    expect(store.read(old.id, old.token, false, 1_000_000)).toMatchObject({
      status: "expired",
    });
    expect(() =>
      store.verify(
        { attemptId: old.id, transactionId: "old", timestamp: 1000 },
        1_000_000,
      ),
    ).toThrow(/Expired/);
  });

  it("runs the real HTTP create → signed callback → claim flow and rejects unverified/client-forged claims", async () => {
    const server = await startRewardsServer({
      port: 0,
      databasePath: ":memory:",
      adUnits: [unit],
      resolveKey: keys,
    });
    cleanup.push(server.close);
    const base = `http://127.0.0.1:${server.port}`;
    expect((await fetch(`${base}/health`)).status).toBe(200);
    const created = await fetch(`${base}/v1/rewards/attempts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId: "http-run" }),
    });
    expect(created.status).toBe(201);
    const attempt = (await created.json()) as { id: string; token: string };
    const claimUrl = `${base}/v1/rewards/attempts/${attempt.id}/claim`;
    const headers = { Authorization: `Bearer ${attempt.token}` };
    expect((await fetch(claimUrl, { method: "POST", headers })).status).toBe(
      409,
    );
    expect((await fetch(claimUrl, { method: "POST" })).status).toBe(401);
    expect(
      (await fetch(`${base}/v1/rewards/admob/ssv?custom_data=${attempt.id}`))
        .status,
    ).toBe(403);
    expect(
      (await fetch(`${base}/v1/rewards/admob/ssv?${callback(attempt.id)}`))
        .status,
    ).toBe(200);
    expect(
      (await fetch(`${base}/v1/rewards/admob/ssv?${callback(attempt.id)}`))
        .status,
    ).toBe(200);
    expect(
      await (await fetch(claimUrl, { method: "POST", headers })).json(),
    ).toMatchObject({ status: "claimed", rows: 2, runId: "http-run" });
    expect(
      (
        await fetch(`${base}/v1/rewards/attempts`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "https://unapproved.example",
          },
          body: "{}",
        })
      ).status,
    ).toBe(403);
  });

  it("fails closed when no publisher ad units are configured", async () => {
    const server = await startRewardsServer({
      port: 0,
      databasePath: ":memory:",
      adUnits: [],
    });
    cleanup.push(server.close);
    const base = `http://127.0.0.1:${server.port}`;
    expect(await (await fetch(`${base}/health`)).json()).toMatchObject({
      configured: false,
    });
    expect(
      (await fetch(`${base}/v1/rewards/attempts`, { method: "POST" })).status,
    ).toBe(503);
  });
});
