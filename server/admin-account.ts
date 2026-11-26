import { eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { adminAccount, adminSessions } from "../db/schema";
import { foldUsername, normalizeUsername } from "../shared/schemas";
import { isPasswordHash, verifyPassword } from "./password";
import { newSession } from "./sessions";

// A valid scrypt hash (same parameters as hashPassword) of a random secret nobody knows. When there
// is no account, the username does not match, or the stored value is not a usable hash, the
// password is checked against this instead, so every login does one full scrypt run with the
// generator's parameters and timing does not reveal whether the username exists.
export const DUMMY_HASH = "scrypt$16384$8$1$Q6hYiZk1bRmnDgh9MtEnjA==$yWm+4iNaQA92JwEScLiW3mt79KEFsvVvQG99f99RNvGCvlcn731UBCCaffvbwL1eLZ78iOqRTgQDxyrWf0Z2DA==";

export type AdminAccount = { username: string; passwordHash: string; version: number };

let warnedMissing = false;

export async function readAdminAccount(): Promise<AdminAccount | null> {
  const [row] = await db
    .select({ username: adminAccount.username, passwordHash: adminAccount.passwordHash, version: adminAccount.version })
    .from(adminAccount)
    .where(eq(adminAccount.id, 1));
  if (!row && !warnedMissing) {
    // Once per function instance; no secrets.
    warnedMissing = true;
    console.error("No admin account. Run admin:create.");
  }
  return row ?? null;
}

export function sameUsername(stored: string, given: string): boolean {
  return foldUsername(stored) === foldUsername(given);
}

const verifyTarget = (hash: string | undefined) => (hash !== undefined && isPasswordHash(hash) ? hash : DUMMY_HASH);

// Always exactly one verifyPassword call (one scrypt run), whatever the branch. On success returns
// the credential version that was verified; the session must be issued for that version.
export async function checkAdminCredentials(username: string, password: string): Promise<{ ok: true; version: number } | { ok: false }> {
  const account = await readAdminAccount();
  const match = account !== null && sameUsername(account.username, username);
  const ok = await verifyPassword(password, verifyTarget(match ? account.passwordHash : undefined));
  return match && ok && isPasswordHash(account.passwordHash) ? { ok: true, version: account.version } : { ok: false };
}

// The current password check of the Account page: one verify, against the dummy hash when no row.
export async function checkAdminPassword(password: string): Promise<{ ok: boolean; account: AdminAccount | null }> {
  const account = await readAdminAccount();
  const ok = await verifyPassword(password, verifyTarget(account?.passwordHash));
  return { ok: ok && account !== null && isPasswordHash(account.passwordHash), account };
}

// CLI create/reset: authoritative. Upserts the row, bumps the credential version (so every session
// and every in-flight login or Account save that verified the old credentials fails) and deletes
// all sessions, in one transaction.
export async function saveAdminAccount(username: string, passwordHash: string, now: Date = new Date()): Promise<void> {
  const values = { username: normalizeUsername(username), passwordHash, updatedAt: now };
  await db.batch([
    db.insert(adminAccount).values({ id: 1, ...values, version: 1 })
      .onConflictDoUpdate({ target: adminAccount.id, set: { ...values, version: sql`${adminAccount.version} + 1` } }),
    db.delete(adminSessions),
  ]);
}

// Account page save: compare-and-set on the version the request verified. One statement: the
// update applies only if the row still has that version; then all sessions are deleted and one
// new session is issued for the new version. A stale request changes nothing and gets null.
export async function updateAdminAccountIfCurrent(
  verifiedVersion: number, username: string, passwordHash: string, now: Date = new Date(),
): Promise<{ token: string; expiresAt: Date } | null> {
  const session = newSession(now);
  const at = sql`${now.toISOString()}::timestamptz`;
  const result = await db.execute(sql`
    WITH updated AS (
      UPDATE admin_account
      SET username = ${normalizeUsername(username)}::text, password_hash = ${passwordHash}::text,
          version = version + 1, updated_at = ${at}
      WHERE id = 1 AND version = ${verifiedVersion}::integer
      RETURNING version
    ), wiped AS (
      DELETE FROM admin_sessions WHERE EXISTS (SELECT 1 FROM updated)
    )
    INSERT INTO admin_sessions (id, created_at, expires_at, last_seen_at, account_version)
    SELECT ${session.id}::text, ${at}, ${session.expiresAt.toISOString()}::timestamptz, ${at}, version FROM updated
    RETURNING id`);
  return result.rows.length > 0 ? { token: session.token, expiresAt: session.expiresAt } : null;
}
