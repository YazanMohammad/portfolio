import crypto from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../db/client";
import { loginAttempts, messages } from "../../db/schema";
import type { MessageInput } from "../../shared";
import { hashIp } from "../../server/ip";
import { reserveSvglSearch, insertMessageIfAllowed, markLoginSuccess, messageRetryAfter, reserveLoginAttempt } from "../../server/rate-limit";
import { describeDb } from "./describe-db";

// Runs only against the Neon test branch. Task 10 fills tests/api/setup.ts.
const TEST_URL = process.env.DATABASE_URL_TEST;

const MIN = 60_000;
const used: string[] = [];

// Random hash per test so tests never share rows.
function freshHash(): string {
  const hash = crypto.randomBytes(32).toString("hex");
  used.push(hash);
  return hash;
}

const input: MessageInput = { name: "Test", email: "test@example.com", subject: null, message: "Hello", website: "" };

// Reserves `times` attempts one second apart (each one is a failure unless marked a success).
async function attempt(hash: string, times: number, now: Date): Promise<boolean[]> {
  const allowed: boolean[] = [];
  for (let i = 0; i < times; i++) allowed.push((await reserveLoginAttempt(hash, new Date(now.getTime() + i * 1000))).allowed);
  return allowed;
}

describeDb("rate limits (real db)", () => {
  let savedUrl: string | undefined;

  beforeAll(() => {
    // Never touch the main database from tests.
    savedUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = TEST_URL;
  });

  afterAll(async () => {
    if (used.length > 0) {
      await db.delete(loginAttempts).where(inArray(loginAttempts.ipHash, used));
      await db.delete(messages).where(inArray(messages.ipHash, used));
    }
    if (savedUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = savedUrl;
  });

  it('svgl search reservations persist across a parallel burst, expire and do not consume login attempts',async()=>{
    const hash=freshHash(), other=freshHash(), now=new Date(); used.push('svgl:'+hash,'svgl:'+other);
    const burst=await Promise.all(Array.from({length:14},()=>reserveSvglSearch(hash,now)));
    expect(burst.filter(r=>r.allowed)).toHaveLength(12);
    expect(burst.filter(r=>!r.allowed)).toEqual([{allowed:false,retryAfter:60},{allowed:false,retryAfter:60}]);
    expect(await reserveSvglSearch(other,now)).toEqual({allowed:true});
    const login=await reserveLoginAttempt(hash,now);expect(login.allowed).toBe(true);
    if(login.allowed)await markLoginSuccess(hash,login.attemptId,now);
    expect(await reserveSvglSearch(hash,now)).toEqual({allowed:false,retryAfter:60});
    expect(await reserveSvglSearch(hash,new Date(now.getTime()+60000))).toEqual({allowed:true});
  });
  it("5 attempts allowed, 6th refused with retryAfter 1..900", async () => {
    const hash = freshHash();
    const now = new Date();
    expect(await attempt(hash, 5, now)).toEqual([true, true, true, true, true]);
    const sixth = await reserveLoginAttempt(hash, new Date(now.getTime() + 5000));
    expect(sixth.allowed).toBe(false);
    if (sixth.allowed) return;
    expect(sixth.retryAfter).toBeGreaterThanOrEqual(1);
    expect(sixth.retryAfter).toBeLessThanOrEqual(900);
    expect(Number.isInteger(sixth.retryAfter)).toBe(true);
  });

  it("retryAfter is when a retry succeeds", async () => {
    const hash = freshHash();
    const now = new Date();
    await attempt(hash, 5, now); // t+0..t+4s
    const sixth = await reserveLoginAttempt(hash, new Date(now.getTime() + 5000)); // row at t+5s
    if (sixth.allowed) throw new Error("expected refusal");
    // 5th newest of t+5,4,3,2,1 is t+1s; it leaves at t+15m+1s, so retryAfter = 15m+1s-5s.
    expect(sixth.retryAfter).toBe(15 * 60 - 4);
    const retryAt = new Date(now.getTime() + 5000 + sixth.retryAfter * 1000);
    expect((await reserveLoginAttempt(hash, retryAt)).allowed).toBe(true);
  });

  it("refused attempts keep the lock", async () => {
    const hash = freshHash();
    const now = new Date();
    await attempt(hash, 5, now);
    for (let i = 0; i < 5; i++) await reserveLoginAttempt(hash, new Date(now.getTime() + 10 * MIN + i * 1000));
    // The first 5 left the window, but the 5 refused ones from t+10m are still in it.
    expect((await reserveLoginAttempt(hash, new Date(now.getTime() + 16 * MIN))).allowed).toBe(false);
  });

  it("allowed again after the window", async () => {
    const hash = freshHash();
    const now = new Date();
    await attempt(hash, 6, now);
    expect((await reserveLoginAttempt(hash, new Date(now.getTime() + 16 * MIN))).allowed).toBe(true);
  });

  it("success clears failures", async () => {
    const hash = freshHash();
    const now = new Date();
    await attempt(hash, 4, now);
    const ok = await reserveLoginAttempt(hash, new Date(now.getTime() + 5000));
    if (!ok.allowed) throw new Error("expected allowed");
    await markLoginSuccess(hash, ok.attemptId, new Date(now.getTime() + 5000));
    expect(await attempt(hash, 5, new Date(now.getTime() + 6000))).toEqual([true, true, true, true, true]);
    const rows = await db.select().from(loginAttempts).where(inArray(loginAttempts.ipHash, [hash]));
    expect(rows.filter((row) => row.success).map((row) => row.id)).toEqual([ok.attemptId]);
  });

  it("other hash does not count", async () => {
    const hash = freshHash();
    const other = freshHash();
    const now = new Date();
    await attempt(other, 6, now);
    expect((await reserveLoginAttempt(hash, new Date(now.getTime() + 7000))).allowed).toBe(true);
    expect((await reserveLoginAttempt(other, new Date(now.getTime() + 7000))).allowed).toBe(false);
  });

  it("parallel attempts cannot exceed 5", async () => {
    const hash = freshHash();
    const now = new Date();
    const results = await Promise.all(Array.from({ length: 10 }, () => reserveLoginAttempt(hash, now)));
    expect(results.filter((result) => result.allowed)).toHaveLength(5);
    const refused = results.filter((result) => !result.allowed);
    expect(refused).toHaveLength(5);
    for (const result of refused) {
      if (result.allowed) continue;
      expect(Number.isInteger(result.retryAfter)).toBe(true);
      expect(result.retryAfter).toBeGreaterThanOrEqual(1);
      expect(result.retryAfter).toBeLessThanOrEqual(900);
    }
    const rows = await db.select().from(loginAttempts).where(inArray(loginAttempts.ipHash, [hash]));
    expect(rows).toHaveLength(10);
    expect(rows.every((row) => !row.success)).toBe(true);
  });

  it("concurrent successes for one hash both resolve", async () => {
    const hash = freshHash();
    const now = new Date();
    const a = await reserveLoginAttempt(hash, now);
    const b = await reserveLoginAttempt(hash, new Date(now.getTime() + 1000));
    await reserveLoginAttempt(hash, new Date(now.getTime() + 2000)); // a failure to clear
    if (!a.allowed || !b.allowed) throw new Error("expected allowed");
    const later = new Date(now.getTime() + 3000);
    await Promise.all([markLoginSuccess(hash, a.attemptId, later), markLoginSuccess(hash, b.attemptId, later)]);
    const rows = await db.select().from(loginAttempts).where(inArray(loginAttempts.ipHash, [hash]));
    // The first success clears every pending failure row for the hash, the other reservation
    // included, so the second UPDATE may hit zero rows. Both must still resolve without deadlock.
    expect(rows.filter((row) => row.success).length).toBeGreaterThanOrEqual(1);
    expect(rows.filter((row) => !row.success)).toHaveLength(0);
  });

  it("old rows of many hashes are pruned while logins overlap", async () => {
    const hashes = [freshHash(), freshHash(), freshHash()];
    const now = new Date();
    const old = new Date(now.getTime() - 2 * 24 * 60 * MIN);
    await db.insert(loginAttempts).values(hashes.flatMap((ipHash) => [{ ipHash, success: false, createdAt: old }]));
    const work = hashes.flatMap((hash) => [
      reserveLoginAttempt(hash, now).then((r) => (r.allowed ? markLoginSuccess(hash, r.attemptId, now) : undefined)),
      reserveLoginAttempt(hash, now),
    ]);
    await Promise.all(work);
    const rows = await db.select().from(loginAttempts).where(inArray(loginAttempts.ipHash, hashes));
    expect(rows.some((row) => row.createdAt.getTime() === old.getTime())).toBe(false);
  });

  it("3 messages allowed then 4th refused in the same hour", async () => {
    const hash = freshHash();
    const now = new Date();
    for (let i = 0; i < 3; i++) {
      await expect(insertMessageIfAllowed(hash, input, new Date(now.getTime() + i * 1000))).resolves.toBe(true);
    }
    await expect(insertMessageIfAllowed(hash, input, new Date(now.getTime() + 5000))).resolves.toBe(false);
    const retryAfter = await messageRetryAfter(hash, new Date(now.getTime() + 5000));
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(3600);
  });

  it("4th allowed after an hour", async () => {
    const hash = freshHash();
    const now = new Date();
    for (let i = 0; i < 3; i++) await insertMessageIfAllowed(hash, input, new Date(now.getTime() + i * 1000));
    await expect(insertMessageIfAllowed(hash, input, new Date(now.getTime() + 61 * MIN))).resolves.toBe(true);
  });

  it("messages of another hash do not count", async () => {
    const hash = freshHash();
    const other = freshHash();
    const now = new Date();
    for (let i = 0; i < 3; i++) await insertMessageIfAllowed(other, input, new Date(now.getTime() + i * 1000));
    await expect(insertMessageIfAllowed(hash, input, new Date(now.getTime() + 5000))).resolves.toBe(true);
  });

  it("unknown ip bucket is limited", async () => {
    // The unknown bucket is shared across tests; start from a clean slate.
    const hash = hashIp(null);
    used.push(hash);
    await db.delete(loginAttempts).where(inArray(loginAttempts.ipHash, [hash]));
    await db.delete(messages).where(inArray(messages.ipHash, [hash]));
    const now = new Date();
    expect(await attempt(hash, 6, now)).toEqual([true, true, true, true, true, false]);
    for (let i = 0; i < 3; i++) await insertMessageIfAllowed(hash, input, new Date(now.getTime() + i * 1000));
    await expect(insertMessageIfAllowed(hash, input, new Date(now.getTime() + 5000))).resolves.toBe(false);
  });

  it("concurrent messages never pass the limit", async () => {
    const hash = freshHash();
    const now = new Date();
    const results = await Promise.all(Array.from({ length: 8 }, () => insertMessageIfAllowed(hash, input, now)));
    expect(results.filter(Boolean)).toHaveLength(3);
  });
});
