import { createPublicKey, verify, type KeyObject } from "node:crypto";

export interface AdmobReward {
  attemptId: string;
  transactionId: string;
  timestamp: number;
}
export type KeyResolver = (keyId: string) => Promise<KeyObject>;

/** Signed bytes must be the original escaped query prefix, not a decoded/reordered query. */
export async function verifyAdmobCallback(
  rawQuery: string,
  resolveKey: KeyResolver,
  adUnits: ReadonlySet<string>,
  now = Date.now(),
): Promise<AdmobReward> {
  if (rawQuery.length > 8192) throw new Error("Invalid callback");
  const match =
    /^(.*)&signature=([A-Za-z0-9_-]+={0,2})&key_id=(\d{1,20})$/.exec(rawQuery);
  if (!match) throw new Error("Invalid signature envelope");
  const [, signed, signature, keyId] = match;
  const parameters = new URLSearchParams(signed);
  const seen = new Set<string>();
  for (const [name] of parameters) {
    if (seen.has(name) || name === "signature" || name === "key_id")
      throw new Error("Duplicate callback field");
    seen.add(name);
  }
  if (
    !verify(
      "sha256",
      Buffer.from(signed, "utf8"),
      await resolveKey(keyId),
      Buffer.from(signature, "base64url"),
    )
  )
    throw new Error("Invalid signature");
  const attemptId = parameters.get("custom_data") ?? "";
  const transactionId = parameters.get("transaction_id") ?? "";
  const timestamp = Number(parameters.get("timestamp"));
  if (
    !adUnits.has(parameters.get("ad_unit") ?? "") ||
    parameters.get("reward_amount") !== "1" ||
    parameters.get("reward_item") !== "continue" ||
    !/^[A-Za-z0-9_-]{32}$/.test(attemptId) ||
    !/^[A-Za-z0-9._:-]{1,256}$/.test(transactionId) ||
    !Number.isSafeInteger(timestamp) ||
    timestamp > now + 60_000 ||
    timestamp < now - 3_600_000
  )
    throw new Error("Invalid reward details");
  return { attemptId, transactionId, timestamp };
}

export function googleKeyResolver(): KeyResolver {
  let keys = new Map<string, KeyObject>();
  let refreshed = 0;
  let pending: Promise<void> | undefined;
  const refresh = async () => {
    const response = await fetch(
      "https://www.gstatic.com/admob/reward/verifier-keys.json",
      { signal: AbortSignal.timeout(5000), redirect: "error" },
    );
    if (!response.ok) throw new Error("Verification keys unavailable");
    const text = await response.text();
    if (text.length > 128_000) throw new Error("Oversized key response");
    const value = JSON.parse(text) as {
      keys?: { keyId: number; pem: string }[];
    };
    if (
      !Array.isArray(value.keys) ||
      !value.keys.length ||
      value.keys.length > 20
    )
      throw new Error("Invalid key response");
    const updated = new Map<string, KeyObject>();
    for (const entry of value.keys) {
      const key = createPublicKey(entry.pem);
      if (key.asymmetricKeyType !== "ec") throw new Error("Invalid key type");
      updated.set(String(entry.keyId), key);
    }
    keys = updated;
    refreshed = Date.now();
  };
  return async (id) => {
    if (
      !keys.size ||
      Date.now() - refreshed > 3_600_000 ||
      (!keys.has(id) && Date.now() - refreshed > 60_000)
    ) {
      pending ??= refresh().finally(() => {
        pending = undefined;
      });
      await pending;
    }
    const key = keys.get(id);
    if (!key) throw new Error("Unknown verification key");
    return key;
  };
}
