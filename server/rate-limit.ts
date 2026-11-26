import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { loginAttempts, messages } from "../db/schema";
import type { MessageInput } from "../shared";

// Contract §4: 5 failed logins per IP hash per 15 min; 3 messages per IP hash per hour.
const LOGIN_MAX_FAILURES = 5;
const LOGIN_WINDOW_MS = 15 * 60_000;
const MESSAGE_MAX = 3;
const MESSAGE_WINDOW_MS = 60 * 60_000;

// All times come from the `now` argument (the function's clock), never the database clock, so
// row timestamps and window checks always use the same clock. Values are bound parameters.
function ts(now: Date) {
  return sql`${now.toISOString()}::timestamptz`;
}

// Seconds until `oldest` leaves a window of `windowMs`, at least 1.
function secondsLeft(oldest: Date, windowMs: number, now: Date): number {
  return Math.max(1, Math.ceil((oldest.getTime() + windowMs - now.getTime()) / 1000));
}

// Advisory lock keys: same hash, different seed per table, so logins and messages do not wait on each other.
function lockHash(ipHash: string, seed: number) {
  return sql`SELECT pg_advisory_xact_lock(hashtextextended(${ipHash}::text, ${seed}::bigint))`;
}

const PRUNE_BATCH = 100;

// Housekeeping: rows older than a day are never needed. This only touches this hash's rows,
// which this hash's writers reach only while holding its advisory lock. It can still briefly wait
// on an old row of this hash that another transaction's global cleanup has locked, until that commits.
function pruneOwnLoginAttempts(ipHash: string, now: Date) {
  return db.delete(loginAttempts).where(and(
    eq(loginAttempts.ipHash, ipHash),
    sql`${loginAttempts.createdAt} < ${ts(now)} - interval '1 day'`,
  ));
}

// Other hashes' old rows (inactive IPs): at most PRUNE_BATCH per call. SKIP LOCKED means it does
// not wait on rows other transactions have locked; it does hold locks on the rows it deletes until
// commit, so another IP's delete of one of those rows may wait briefly. It runs last in the batch,
// so it never waits on another lock afterwards and cannot close a deadlock cycle.
// Rows it skips are picked up by a later call.
function pruneOldLoginAttempts(now: Date) {
  return db.execute(sql`DELETE FROM login_attempts WHERE ctid IN (SELECT ctid FROM login_attempts WHERE created_at < ${ts(now)} - interval '1 day' LIMIT ${sql.raw(String(PRUNE_BATCH))} FOR UPDATE SKIP LOCKED)`);
}

// Reserve-then-verify: every login attempt first stores a failure row, then counts. A parallel
// burst cannot slip past the limit, and a refused attempt still counts, so hammering stays locked.
// On a correct password the caller calls markLoginSuccess with the returned attemptId.
export async function reserveLoginAttempt(
  ipHash: string,
  now: Date = new Date(),
): Promise<{ allowed: true; attemptId: number } | { allowed: false; retryAfter: number }> {
  const [, , inserted, recent] = await db.batch([
    db.execute(lockHash(ipHash, 1)),
    // Prune on every attempt, so a flood of refused attempts cannot grow the table without bound.
    pruneOwnLoginAttempts(ipHash, now),
    db.insert(loginAttempts).values({ ipHash, success: false, createdAt: now }).returning({ id: loginAttempts.id }),
    db
      .select({ createdAt: loginAttempts.createdAt })
      .from(loginAttempts)
      .where(and(
        eq(loginAttempts.ipHash, ipHash),
        eq(loginAttempts.success, false),
        sql`${loginAttempts.createdAt} > ${ts(now)} - interval '15 minutes'`,
      ))
      .orderBy(desc(loginAttempts.createdAt))
      .limit(LOGIN_MAX_FAILURES + 1),
    // Last, so it runs after this transaction's own work. Here rather than in markLoginSuccess:
    // reservations happen on every attempt (successes may be rare), so inactive rows still drain.
    pruneOldLoginAttempts(now),
  ]);
  // `recent` includes the row just inserted. Up to 5 in the window are allowed.
  if (recent.length <= LOGIN_MAX_FAILURES) return { allowed: true, attemptId: inserted[0].id };
  // A retry succeeds once only 4 rows remain (the retry adds the 5th): that is when the
  // 5th newest row leaves the window.
  return { allowed: false, retryAfter: secondsLeft(recent[LOGIN_MAX_FAILURES - 1].createdAt, LOGIN_WINDOW_MS, now) };
}

// Turns the reserved row into a success, clears this hash's failures and prunes its old rows.
// The advisory lock comes first, so concurrent successes (and reservations) for one hash run one
// at a time instead of each locking a row the other's failure DELETE needs.
export async function markLoginSuccess(ipHash: string, attemptId: number, now: Date = new Date()): Promise<void> {
  await db.batch([
    db.execute(lockHash(ipHash, 1)),
    db.update(loginAttempts).set({ success: true })
      .where(and(eq(loginAttempts.id, attemptId), eq(loginAttempts.ipHash, ipHash))),
    db.delete(loginAttempts).where(and(eq(loginAttempts.ipHash, ipHash), eq(loginAttempts.success, false))),
    pruneOwnLoginAttempts(ipHash, now),
  ]);
}

// Inserts the message only if this IP hash sent fewer than 3 in the last hour.
// The check and the insert are one statement. The advisory lock before it (same transaction)
// makes concurrent sends from one IP hash wait their turn, so a burst cannot all see count < 3.
export async function insertMessageIfAllowed(ipHash: string, input: MessageInput, now: Date = new Date()): Promise<boolean> {
  const [, inserted] = await db.batch([
    db.execute(lockHash(ipHash, 0)),
    db.execute(sql`
      INSERT INTO messages (name, email, subject, message, ip_hash, created_at)
      SELECT ${input.name}::text, ${input.email}::text, ${input.subject ?? null}::text, ${input.message}::text,
             ${ipHash}::text, ${ts(now)}
      WHERE (
        SELECT count(*) FROM messages
        WHERE ip_hash = ${ipHash}::text AND created_at > ${ts(now)} - interval '1 hour'
      ) < ${MESSAGE_MAX}
      RETURNING id`),
  ]);
  return inserted.rows.length > 0;
}

// Seconds until the oldest of the last 3 messages leaves the hour, at least 1.
export async function messageRetryAfter(ipHash: string, now: Date = new Date()): Promise<number> {
  const rows = await db
    .select({ createdAt: messages.createdAt })
    .from(messages)
    .where(and(eq(messages.ipHash, ipHash), sql`${messages.createdAt} > ${ts(now)} - interval '1 hour'`))
    .orderBy(desc(messages.createdAt))
    .limit(MESSAGE_MAX);
  if (rows.length < MESSAGE_MAX) return 1;
  return secondsLeft(rows[MESSAGE_MAX - 1].createdAt, MESSAGE_WINDOW_MS, now);
}
