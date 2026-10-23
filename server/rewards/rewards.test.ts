import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
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

it("migrates old ledgers without losing continue receipts and isolates permanent theme grants", () => {
  mkdirSync(resolve("artifacts/rewards-tests"), { recursive: true });
  const path = resolve(
    `artifacts/rewards-tests/migration-${Date.now()}.sqlite`,
  );
  const old = new DatabaseSync(path);
  old.exec(`CREATE TABLE attempts(id TEXT PRIMARY KEY, run_id TEXT NOT NULL, token_hash TEXT NOT NULL, created INTEGER NOT NULL, expires INTEGER NOT NULL, status TEXT NOT NULL);
    CREATE TABLE grants(run_id TEXT PRIMARY KEY, attempt_id TEXT UNIQUE NOT NULL, transaction_id TEXT UNIQUE NOT NULL, created INTEGER NOT NULL);`);
  old
    .prepare("INSERT INTO attempts VALUES(?,?,?,?,?,?)")
    .run(
      "old-attempt",
      "old-run",
      createHash("sha256").update("old-token").digest("hex"),
      1,
      2,
      "claimed",
    );
  old
    .prepare("INSERT INTO grants VALUES(?,?,?,?)")
    .run("old-run", "old-attempt", "old-transaction", 1);
  old.close();
  let store = new RewardStore(path);
  expect(store.read("old-attempt", "old-token", true)).toMatchObject({
    status: "claimed",
    rows: 2,
    runId: "old-run",
  });
  expect(() => store.create("old-run")).toThrow(/already/);
  const continued = store.create("legacy");
  store.verify({
    attemptId: continued.id,
    transactionId: "legacy-tx",
    timestamp: Date.now(),
  });
  const a = store.createTheme("profile", "neon"),
    b = store.createTheme("profile", "amber");
  for (const attempt of [a, b])
    store.verify({
      attemptId: attempt.id,
      transactionId: attempt.id,
      timestamp: Date.now(),
    });
  store.close();
  store = new RewardStore(path);
  cleanup.push(() => store.close());
  expect(store.read(continued.id, continued.token, true)).toMatchObject({
    status: "claimed",
    runId: "legacy",
    rows: 2,
  });
  expect(store.read(a.id, a.token, true)).toEqual({
    status: "claimed",
    placement: "theme",
    profileId: "profile",
    themeId: "neon",
  });
  expect(store.read(a.id, b.token, true)).toBeNull();
  expect(() => store.createTheme("profile", "neon")).toThrow(/already/);
  expect(() => store.createTheme("profile", "ink")).toThrow(/Invalid/);
  expect(() => store.createTheme("profile", "invented" as never)).toThrow(
    /Invalid/,
  );
  expect(() => store.createTheme("profile:forged", "neon")).toThrow(/Invalid/);
  expect(store.createTheme("another-profile", "neon")).toHaveProperty("id");
});

it("creates theme attempts through HTTP and ignores forged claim target bodies", async () => {
  const server = await startRewardsServer({
    port: 0,
    databasePath: ":memory:",
    adUnits: [unit],
    resolveKey: keys,
  });
  cleanup.push(server.close);
  const base = `http://127.0.0.1:${server.port}`;
  const create = (body: unknown) =>
    fetch(`${base}/v1/rewards/attempts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  for (const themeId of ["ink", "unknown"])
    expect(
      (await create({ placement: "theme", profileId: "profile", themeId }))
        .status,
    ).toBe(400);
  expect((await create({ placement: "cash", runId: "forged" })).status).toBe(
    400,
  );
  const created = await create({
    placement: "theme",
    profileId: "profile",
    themeId: "neon",
    runId: "forged",
  });
  expect(created.status).toBe(201);
  const attempt = (await created.json()) as { id: string; token: string };
  expect(
    (
      await fetch(
        `${base}/v1/rewards/admob/ssv?${callback(attempt.id, { transaction_id: "theme-http" })}`,
      )
    ).status,
  ).toBe(200);
  const receipt = await fetch(
    `${base}/v1/rewards/attempts/${attempt.id}/claim`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${attempt.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        placement: "continue",
        profileId: "other",
        themeId: "amber",
      }),
    },
  );
  expect(await receipt.json()).toEqual({
    status: "claimed",
    placement: "theme",
    profileId: "profile",
    themeId: "neon",
  });
  expect(
    (
      await create({
        placement: "theme",
        profileId: "profile",
        themeId: "neon",
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await create({
        placement: "theme",
        profileId: "profile",
        themeId: "amber",
      })
    ).status,
  ).toBe(201);
});
