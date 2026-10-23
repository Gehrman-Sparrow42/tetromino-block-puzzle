import { createHash, randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { AdmobReward } from "./ssv";

interface Attempt {
  id: string;
  run_id: string;
  token_hash: string;
  created: number;
  expires: number;
  status: "pending" | "verified" | "claimed";
}
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export class RewardStore {
  private readonly db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS attempts(id TEXT PRIMARY KEY, run_id TEXT NOT NULL, token_hash TEXT NOT NULL, created INTEGER NOT NULL, expires INTEGER NOT NULL, status TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS attempts_run ON attempts(run_id);
      CREATE TABLE IF NOT EXISTS grants(run_id TEXT PRIMARY KEY, attempt_id TEXT UNIQUE NOT NULL, transaction_id TEXT UNIQUE NOT NULL, created INTEGER NOT NULL);`);
  }
  create(runId: string, now = Date.now()) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(runId))
      throw new Error("Invalid run ID");
    this.db
      .prepare("DELETE FROM attempts WHERE expires < ? AND status = 'pending'")
      .run(now - 3_600_000);
    if (this.db.prepare("SELECT 1 FROM grants WHERE run_id = ?").get(runId))
      throw new Error("This run already received its continue");
    if (
      (
        this.db.prepare("SELECT COUNT(*) AS n FROM attempts").get() as {
          n: number;
        }
      ).n >= 10000 ||
      (
        this.db
          .prepare("SELECT COUNT(*) AS n FROM attempts WHERE run_id = ?")
          .get(runId) as { n: number }
      ).n >= 5
    )
      throw new Error("Reward attempt limit reached");
    const id = randomBytes(24).toString("base64url"),
      token = randomBytes(32).toString("base64url");
    const expiresAt = now + 15 * 60_000;
    this.db
      .prepare("INSERT INTO attempts VALUES(?,?,?,?,?, 'pending')")
      .run(id, runId, hash(token), now, expiresAt);
    return { id, token, rows: 2, expiresAt };
  }
  verify(reward: AdmobReward, now = Date.now()) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const existing = this.db
        .prepare("SELECT attempt_id FROM grants WHERE transaction_id = ?")
        .get(reward.transactionId) as { attempt_id: string } | undefined;
      if (existing) {
        if (existing.attempt_id !== reward.attemptId)
          throw new Error("Transaction already used");
        this.db.exec("COMMIT");
        return;
      }
      const attempt = this.db
        .prepare("SELECT * FROM attempts WHERE id = ?")
        .get(reward.attemptId) as unknown as Attempt | undefined;
      if (
        !attempt ||
        attempt.expires < now ||
        reward.timestamp < attempt.created - 60_000 ||
        reward.timestamp > attempt.expires
      )
        throw new Error("Expired or unknown attempt");
      if (
        this.db
          .prepare("SELECT 1 FROM grants WHERE run_id = ?")
          .get(attempt.run_id)
      )
        throw new Error("Run already rewarded");
      this.db
        .prepare("INSERT INTO grants VALUES(?,?,?,?)")
        .run(attempt.run_id, attempt.id, reward.transactionId, now);
      this.db
        .prepare("UPDATE attempts SET status = 'verified' WHERE id = ?")
        .run(attempt.id);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  read(id: string, token: string, claim = false, now = Date.now()) {
    const attempt = this.db
      .prepare("SELECT * FROM attempts WHERE id = ? AND token_hash = ?")
      .get(id, hash(token)) as unknown as Attempt | undefined;
    if (!attempt) return null;
    if (attempt.status === "pending" && attempt.expires < now)
      return { status: "expired", rows: 2, runId: attempt.run_id };
    if (claim) {
      if (attempt.status === "pending")
        throw new Error("Reward has not been verified");
      this.db
        .prepare("UPDATE attempts SET status = 'claimed' WHERE id = ?")
        .run(id);
    }
    return {
      status: claim ? "claimed" : attempt.status,
      rows: 2,
      runId: attempt.run_id,
    };
  }
  close() {
    this.db.close();
  }
}
