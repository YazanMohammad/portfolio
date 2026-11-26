import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { adminAccount, adminSessions } from "../db/schema";
import { verifyPassword } from "./password";

// A valid scrypt hash (same parameters as hashPassword) of a random secret nobody knows. When there
// is no account, or the username does not match, the password is checked against this instead,
// so every login does one full scrypt run and timing does not reveal whether the username exists.
export const DUMMY_HASH = "scrypt$16384$8$1$Q6hYiZk1bRmnDgh9MtEnjA==$yWm+4iNaQA92JwEScLiW3mt79KEFsvVvQG99f99RNvGCvlcn731UBCCaffvbwL1eLZ78iOqRTgQDxyrWf0Z2DA==";

export type AdminAccount = { username: string; passwordHash: string };

let warnedMissing = false;

export async function readAdminAccount(): Promise<AdminAccount | null> {
  const [row] = await db
    .select({ username: adminAccount.username, passwordHash: adminAccount.passwordHash })
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
  return stored.trim().toLowerCase() === given.trim().toLowerCase();
}

// Always exactly one verifyPassword call, whatever the branch.
export async function checkAdminCredentials(username: string, password: string): Promise<boolean> {
  const account = await readAdminAccount();
  const match = account !== null && sameUsername(account.username, username);
  const ok = await verifyPassword(password, match ? account.passwordHash : DUMMY_HASH);
  return match && ok;
}

// The current password check of the Account page: one verify, against the dummy hash when no row.
export async function checkAdminPassword(password: string): Promise<{ ok: boolean; account: AdminAccount | null }> {
  const account = await readAdminAccount();
  const ok = await verifyPassword(password, account?.passwordHash ?? DUMMY_HASH);
  return { ok: ok && account !== null, account };
}

function upsert(username: string, passwordHash: string, now: Date) {
  const values = { username: username.trim(), passwordHash, updatedAt: now };
  return db.insert(adminAccount).values({ id: 1, ...values }).onConflictDoUpdate({ target: adminAccount.id, set: values });
}

// Saves the singleton row and ends every session, in one transaction (old logins end).
export async function saveAdminAccount(username: string, passwordHash: string, now: Date = new Date()): Promise<void> {
  await db.batch([upsert(username, passwordHash, now), db.delete(adminSessions)]);
}
