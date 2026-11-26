import type { Context } from "@netlify/functions";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { adminHandler } from "./handlers";
import { fail, json } from "./http";
import { requireAdmin, shouldRenew } from "./sessions";

// requireAdmin needs the DB, so it is stubbed here; the rest of ./sessions is real.
vi.mock("./sessions", async (importOriginal) => {
  const real = await importOriginal<typeof import("./sessions")>();
  return { ...real, requireAdmin: vi.fn() };
});

const ORIGIN = "https://www.yznmoh.com";
const RENEWED = "__Host-session=renewed; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800";
const ctx = {} as Context;
const admin = vi.mocked(requireAdmin);

beforeEach(() => {
  vi.stubEnv("SITE_ORIGIN", ORIGIN);
  admin.mockReset();
  admin.mockResolvedValue({ renewedCookie: null });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

// A plain object, so the method is not normalized the way `new Request` normalizes it.
function fakeRequest(method: string, origin?: string): Request {
  const headers = new Headers();
  if (origin !== undefined) headers.set("Origin", origin);
  return { method, headers, url: `${ORIGIN}/api/admin/x` } as unknown as Request;
}

it("a renewed cookie is added to the response", async () => {
  admin.mockResolvedValue({ renewedCookie: RENEWED });
  const response = await adminHandler(async () => json({ ok: true }, { headers: { "Set-Cookie": "other=1" } }))(fakeRequest("GET"), ctx);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
  expect(response.headers.getSetCookie()).toEqual(["other=1", RENEWED]);
});

it("a renewed cookie is added to a handler error response too", async () => {
  admin.mockResolvedValue({ renewedCookie: RENEWED });
  const response = await adminHandler(async () => json({ error: "x" }, { status: 404 }))(fakeRequest("GET"), ctx);
  expect(response.status).toBe(404);
  expect(response.headers.getSetCookie()).toEqual([RENEWED]);
});

it("thrown handler error keeps the renewed cookie", async () => {
  admin.mockResolvedValue({ renewedCookie: RENEWED });
  const response = await adminHandler(async () => { throw fail("not_found", "Not found."); })(fakeRequest("GET"), ctx);
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: { code: "not_found", message: "Not found." } });
  expect(response.headers.getSetCookie()).toEqual([RENEWED]);
});

it("unexpected thrown error keeps the renewed cookie on the generic 500", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  admin.mockResolvedValue({ renewedCookie: RENEWED });
  const response = await adminHandler(async () => { throw new Error("boom"); })(fakeRequest("GET"), ctx);
  expect(response.status).toBe(500);
  expect((await response.json()).error.code).toBe("server");
  expect(response.headers.getSetCookie()).toEqual([RENEWED]);
});

it("no cookie on error when not renewed", async () => {
  const response = await adminHandler(async () => { throw fail("not_found", "Not found."); })(fakeRequest("GET"), ctx);
  expect(response.status).toBe(404);
  expect(response.headers.getSetCookie()).toEqual([]);
});

it("401 from requireAdmin has no cookie", async () => {
  admin.mockRejectedValue(fail("unauthorized", "Sign in."));
  const fn = vi.fn(async () => json({ ok: true }));
  const response = await adminHandler(fn)(fakeRequest("GET"), ctx);
  expect(response.status).toBe(401);
  expect(response.headers.getSetCookie()).toEqual([]);
  expect(fn).not.toHaveBeenCalled();
});

it("no cookie is added when the session was not renewed", async () => {
  const response = await adminHandler(async () => json({ ok: true }))(fakeRequest("GET"), ctx);
  expect(response.status).toBe(200);
  expect(response.headers.getSetCookie()).toEqual([]);
});

it("decoration failure gives generic 500", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  admin.mockResolvedValue({ renewedCookie: RENEWED });
  // Response.error() has status 0, which cannot be copied into a new Response: decoration throws.
  const response = await adminHandler(async () => Response.error())(fakeRequest("GET"), ctx);
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: { code: "server", message: "Something went wrong." } });
});

it("a consumed body during decoration yields the generic 500 JSON", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  admin.mockResolvedValue({ renewedCookie: RENEWED });
  const response = await adminHandler(async () => {
    const used = json({ ok: true });
    await used.text();
    return used;
  })(fakeRequest("GET"), ctx);
  expect(response.status).toBe(500);
  expect((await response.json()).error.code).toBe("server");
});

it("lower-case post is a write: origin checked", async () => {
  const fn = vi.fn(async () => json({ ok: true }));
  const response = await adminHandler(fn)(fakeRequest("post", "https://evil.com"), ctx);
  expect(response.status).toBe(403);
  expect(fn).not.toHaveBeenCalled();
  expect(admin).not.toHaveBeenCalled();
  expect((await adminHandler(fn)(fakeRequest("post", ORIGIN), ctx)).status).toBe(200);
});

it("HEAD and head are reads: no origin check", async () => {
  const fn = vi.fn(async () => json({ ok: true }));
  for (const method of ["HEAD", "head", "OPTIONS", "get"]) {
    const response = await adminHandler(fn)(fakeRequest(method, "https://evil.com"), ctx);
    expect(response.status, method).toBe(200);
  }
});

it("an unknown verb is a write: origin checked", async () => {
  const fn = vi.fn(async () => json({ ok: true }));
  for (const method of ["PROPFIND", "PATCH", "patch", "DELETE"]) {
    const response = await adminHandler(fn)(fakeRequest(method, "https://evil.com"), ctx);
    expect(response.status, method).toBe(403);
    expect((await adminHandler(fn)(fakeRequest(method), ctx)).status, method).toBe(403);
  }
  expect(fn).not.toHaveBeenCalled();
});

it("Origin null is refused on writes", async () => {
  const response = await adminHandler(async () => json({ ok: true }))(fakeRequest("POST", "null"), ctx);
  expect(response.status).toBe(403);
});

it("shouldRenew renews only after more than one hour", () => {
  const now = new Date("2026-11-25T12:00:00.000Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);
  expect(shouldRenew(ago(0), now)).toBe(false);
  expect(shouldRenew(ago(30 * 60_000), now)).toBe(false);
  expect(shouldRenew(ago(60 * 60_000), now)).toBe(false);
  expect(shouldRenew(ago(60 * 60_000 + 1), now)).toBe(true);
  expect(shouldRenew(ago(2 * 60 * 60_000), now)).toBe(true);
});

it("a handler that sets its own session cookie (rotation) is not overridden by the renewal", async () => {
  admin.mockResolvedValue({ renewedCookie: RENEWED });
  const rotated = "__Host-session=rotated; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800";
  const response = await adminHandler(async () => json({ ok: true }, { headers: { "Set-Cookie": rotated } }))(fakeRequest("PUT", ORIGIN), ctx);
  expect(response.headers.getSetCookie()).toEqual([rotated]);
});
