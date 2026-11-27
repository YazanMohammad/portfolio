import { afterAll, beforeAll, expect, it, vi } from "vitest";

// SQL-shape tests: real drizzle + Neon driver, with the HTTP fetch stubbed, so no database is needed.
type Query = { query: string; params: unknown[] };
const sent: Query[][] = [];
let reserve: typeof import("./rate-limit").reserveLoginAttempt;
let markSuccess: typeof import("./rate-limit").markLoginSuccess;
let savedUrl: string | undefined;

function answer(query: string) {
  // Only the INSERT ... RETURNING id gets a row; Neon sends rows as arrays.
  return query.startsWith("insert")
    ? { fields: [{ name: "id", dataTypeID: 23 }], rows: [["7"]], rowCount: 1, command: "INSERT" }
    : { fields: [], rows: [], rowCount: 0, command: "SELECT" };
}

beforeAll(async () => {
  savedUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "postgresql://user:pass@ep-shape-test-pooler.example.neon.tech/db";
  vi.stubGlobal("fetch", async (_url: unknown, init: { body: string }) => {
    const body = JSON.parse(init.body) as Query | { queries: Query[] };
    const queries = "queries" in body ? body.queries : [body];
    sent.push(queries);
    const results = queries.map((q) => answer(q.query));
    return new Response(JSON.stringify("queries" in body ? { results } : results[0]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  ({ reserveLoginAttempt: reserve, markLoginSuccess: markSuccess } = await import("./rate-limit"));
});

afterAll(() => {
  vi.unstubAllGlobals();
  if (savedUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = savedUrl;
});

const HASH = "h'); drop table login_attempts; --";
const NOW = new Date("2026-11-25T12:00:00.000Z");

const LOCK = /^SELECT pg_advisory_xact_lock\(hashtextextended\(\$1::text, \$2::bigint\)\)$/;
const HASH_PRUNE = 'delete from "login_attempts" where ("login_attempts"."ip_hash" = $1 and "login_attempts"."created_at" < $2::timestamptz - interval \'1 day\')';

function expectGlobalPrune(q: Query) {
  // Bounded and lock-free: only other transactions' unlocked old rows, at most 100.
  expect(q.query).toMatch(/^DELETE FROM login_attempts WHERE ctid IN \(SELECT ctid FROM login_attempts WHERE created_at < \$1::timestamptz - interval '1 day' LIMIT 100 FOR UPDATE SKIP LOCKED\)$/);
  expect(q.params).toEqual([NOW.toISOString()]);
}

it("reserveLoginAttempt: lock first, per-hash prune, insert, count, bounded global prune last", async () => {
  sent.length = 0;
  await expect(reserve(HASH, NOW)).resolves.toEqual({ allowed: true, attemptId: 7 });
  expect(sent).toHaveLength(1);
  expect(sent[0]).toHaveLength(5);
  const [lock, prune, insert, count, global] = sent[0];
  expect(lock.query).toMatch(LOCK);
  expect(lock.params).toEqual([HASH, "1"]);
  expect(prune.query).toBe(HASH_PRUNE);
  expect(prune.params).toEqual([HASH, NOW.toISOString()]);
  expect(insert.query).toMatch(/^insert into "login_attempts"/);
  expect(count.query).toMatch(/^select "created_at" from "login_attempts"/);
  expectGlobalPrune(global);
});

it("markLoginSuccess: same lock first, then update, clear failures, per-hash prune only", async () => {
  sent.length = 0;
  await markSuccess(HASH, 7, NOW);
  expect(sent).toHaveLength(1);
  const [lock, update, clear, prune, ...rest] = sent[0];
  expect(rest).toEqual([]);
  expect(lock.query).toMatch(LOCK);
  expect(lock.params).toEqual([HASH, "1"]);
  expect(update.query).toMatch(/^update "login_attempts" set "success" = \$1 where/);
  expect(clear.query).toMatch(/^delete from "login_attempts" where \("login_attempts"\."ip_hash" = \$1 and "login_attempts"\."success" = \$2\)$/);
  expect(clear.params).toEqual([HASH, "false"]);
  expect(prune.query).toBe(HASH_PRUNE);
  expect(prune.params).toEqual([HASH, NOW.toISOString()]);
});

it("no statement deletes other hashes' rows except the SKIP LOCKED global prune", async () => {
  sent.length = 0;
  await reserve(HASH, NOW);
  await markSuccess(HASH, 7, NOW);
  for (const q of sent.flat().filter((q) => /^delete/i.test(q.query))) {
    if (q.query.includes("SKIP LOCKED")) continue;
    expect(q.query).toContain('"login_attempts"."ip_hash" = $1');
    expect(q.params[0]).toBe(HASH);
  }
});

import * as rateLimit from './rate-limit';
it('svgl reservations use the existing persistent, atomic limiter with a separate bucket',async()=>{
 const reserveSvglSearch=(rateLimit as unknown as Record<string,typeof reserve>).reserveSvglSearch;
 expect(reserveSvglSearch).toBeTypeOf('function');sent.length=0;
 await reserveSvglSearch(HASH,NOW);
 const queries=sent[0];expect(queries[0].query).toMatch(LOCK);expect(queries[0].params).toEqual(['svgl:'+HASH,'2']);
 expect(queries[1].query).toBe(HASH_PRUNE);
 const insert=queries.find(q=>/INSERT INTO login_attempts/.test(q.query))!;
 expect(insert.query).toContain("interval '1 minute'");expect(insert.query).toContain('SELECT count(*)');expect(insert.query).toContain('RETURNING id');
 for(const q of queries)expect(q.query).not.toContain(HASH);
});
it("no value is spliced into the SQL text", async () => {
  sent.length = 0;
  await reserve(HASH, NOW);
  await markSuccess(HASH, 7, NOW);
  for (const q of sent.flat()) {
    expect(q.query).not.toContain("drop table");
    expect(q.query).not.toContain(NOW.toISOString());
  }
});
