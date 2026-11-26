import crypto from "node:crypto";
import type { Context } from "@netlify/functions";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "../../db/client";
import { adminSessions } from "../../db/schema";
import { adminHandler } from "../../server/handlers";
import { json } from "../../server/http";
import { createSession, deleteSession, requireAdmin, validateSession } from "../../server/sessions";
import { describeDb } from "./describe-db";

// Runs only against the Neon test branch. Task 10 fills tests/api/setup.ts.
const TEST_URL = process.env.DATABASE_URL_TEST;

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const ORIGIN = "https://www.yznmoh.com";
const ctx = {} as Context;
const used: string[] = [];

function sha256(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function fresh(now = new Date()) {
  const session = await createSession(now);
  used.push(sha256(session.token));
  return session;
}

async function row(token: string) {
  const [found] = await db.select().from(adminSessions).where(eq(adminSessions.id, sha256(token)));
  return found;
}

function request(token: string | null, method = "GET", origin?: string): Request {
  const headers = new Headers();
  if (token !== null) headers.set("Cookie", `__Host-session=${token}`);
  if (origin !== undefined) headers.set("Origin", origin);
  return new Request(`${ORIGIN}/api/admin/x`, { method, headers });
}

describeDb("sessions (real db)", () => {
  let savedUrl: string | undefined;

  beforeAll(() => {
    // Never touch the main database from tests.
    savedUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = TEST_URL;
    vi.stubEnv("SITE_ORIGIN", ORIGIN);
  });

  afterAll(async () => {
    if (used.length > 0) await db.delete(adminSessions).where(inArray(adminSessions.id, used));
    vi.unstubAllEnvs();
    if (savedUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = savedUrl;
  });

  it("createSession stores a hash, not the token", async () => {
    const now = new Date();
    const { token, expiresAt } = await fresh(now);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(expiresAt.getTime()).toBe(now.getTime() + 7 * DAY);
    const [byToken] = await db.select().from(adminSessions).where(eq(adminSessions.id, token));
    expect(byToken).toBeUndefined();
    const stored = await row(token);
    expect(stored?.id).toBe(sha256(token));
    expect(stored?.id).not.toBe(token);
    expect(stored?.expiresAt.getTime()).toBe(expiresAt.getTime());
  });

  it("valid session validates", async () => {
    const now = new Date();
    const { token } = await fresh(now);
    expect(await validateSession(token, new Date(now.getTime() + MIN))).toEqual({ valid: true, renewed: false });
  });

  it("expired session is rejected", async () => {
    const now = new Date();
    const { token } = await fresh(now);
    expect(await validateSession(token, new Date(now.getTime() + 8 * DAY))).toEqual({ valid: false, renewed: false });
  });

  it("unknown token rejected", async () => {
    const token = crypto.randomBytes(32).toString("base64url");
    expect(await validateSession(token)).toEqual({ valid: false, renewed: false });
  });

  it("garbage token rejected without throwing", async () => {
    for (const bad of ["x", "x".repeat(5 * 1024), "%00", "' OR 1=1 --".padEnd(43, "-")]) {
      expect(await validateSession(bad)).toEqual({ valid: false, renewed: false });
    }
  });

  it("deleteSession invalidates", async () => {
    const { token } = await fresh();
    await deleteSession(token);
    expect(await row(token)).toBeUndefined();
    expect(await validateSession(token)).toEqual({ valid: false, renewed: false });
  });

  it("renews only after an hour", async () => {
    const now = new Date();
    const { token, expiresAt } = await fresh(now);
    expect(await validateSession(token, new Date(now.getTime() + 30 * MIN))).toEqual({ valid: true, renewed: false });
    expect((await row(token))?.expiresAt.getTime()).toBe(expiresAt.getTime());
    const later = new Date(now.getTime() + 2 * 60 * MIN);
    expect(await validateSession(token, later)).toEqual({ valid: true, renewed: true });
    const renewed = await row(token);
    expect(renewed?.expiresAt.getTime()).toBe(later.getTime() + 7 * DAY);
    expect(renewed?.lastSeenAt.getTime()).toBe(later.getTime());
    // Just renewed, so the next call does not renew again.
    expect(await validateSession(token, new Date(later.getTime() + MIN))).toEqual({ valid: true, renewed: false });
  });

  it("createSession removes long-expired rows but keeps live ones", async () => {
    const old = new Date(Date.now() - 30 * DAY);
    const stale = await fresh(old);
    const live = await fresh();
    await fresh();
    expect(await row(stale.token)).toBeUndefined();
    expect(await row(live.token)).toBeDefined();
  });

  it("requireAdmin throws unauthorized with no cookie", async () => {
    await expect(requireAdmin(request(null))).rejects.toMatchObject({ code: "unauthorized", status: 401 });
  });

  it("requireAdmin returns a renewed cookie only after renewal", async () => {
    const now = new Date();
    const { token } = await fresh(now);
    expect(await requireAdmin(request(token), new Date(now.getTime() + MIN))).toEqual({ renewedCookie: null });
    const { renewedCookie } = await requireAdmin(request(token), new Date(now.getTime() + 2 * 60 * MIN));
    expect(renewedCookie).toContain(`__Host-session=${token};`);
    expect(renewedCookie).toContain("Max-Age=604800");
  });

  it("adminHandler checks origin before session on writes", async () => {
    const fn = vi.fn(async () => json({ ok: true }));
    const response = await adminHandler(fn)(request(null, "POST", "https://evil.com"), ctx);
    expect(response.status).toBe(403);
    const { token } = await fresh();
    const withSession = await adminHandler(fn)(request(token, "POST", "https://evil.com"), ctx);
    expect(withSession.status).toBe(403);
    expect(fn).not.toHaveBeenCalled();
  });

  it("adminHandler returns 401 for GET without cookie", async () => {
    const fn = vi.fn(async () => json({ ok: true }));
    expect((await adminHandler(fn)(request(null), ctx)).status).toBe(401);
    expect(fn).not.toHaveBeenCalled();
  });

  it("adminHandler runs the handler for a valid session", async () => {
    const { token } = await fresh();
    const fn = vi.fn(async () => json({ ok: true }));
    expect((await adminHandler(fn)(request(token), ctx)).status).toBe(200);
    expect((await adminHandler(fn)(request(token, "POST", ORIGIN), ctx)).status).toBe(200);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
