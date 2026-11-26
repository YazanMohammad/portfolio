import type { Context } from "@netlify/functions";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { adminHandler } from "./handlers";
import { HttpError, json } from "./http";
import { checkOrigin } from "./origin";
import {
  clearSessionCookie,
  cookieName,
  deleteSession,
  readSessionToken,
  requireAdmin,
  sessionCookie,
  validateSession,
} from "./sessions";

// Pure parts only: no DATABASE_URL here, so any DB access would throw.
const ORIGIN = "https://www.yznmoh.com";
const TOKEN = "A".repeat(42) + "_";
const ctx = {} as Context;

beforeEach(() => {
  vi.stubEnv("SITE_ORIGIN", ORIGIN);
  vi.stubEnv("DATABASE_URL", "");
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

function withCookie(cookie: string | null, init: RequestInit & { origin?: string } = {}): Request {
  const headers = new Headers(init.headers);
  if (cookie !== null) headers.set("Cookie", cookie);
  if (init.origin !== undefined) headers.set("Origin", init.origin);
  return new Request(`${ORIGIN}/api/admin/x`, { method: init.method ?? "GET", headers });
}

function parts(cookie: string): string[] {
  return cookie.split(";").map((part) => part.trim());
}

function originError(req: Request): HttpError | undefined {
  try {
    checkOrigin(req);
    return undefined;
  } catch (error) {
    return error as HttpError;
  }
}

it("cookie has HttpOnly Secure SameSite=Strict Path=/ Max-Age=604800 and __Host- prefix", () => {
  expect(cookieName()).toBe("__Host-session");
  const cookie = parts(sessionCookie(TOKEN));
  expect(cookie[0]).toBe(`__Host-session=${TOKEN}`);
  expect(cookie.slice(1).sort()).toEqual(["HttpOnly", "Max-Age=604800", "Path=/", "SameSite=Strict", "Secure"]);
  expect(cookie.some((part) => part.startsWith("Domain"))).toBe(false);
});

it("local http cookie has name session and no Secure", () => {
  vi.stubEnv("SITE_ORIGIN", "http://localhost:8888");
  expect(cookieName()).toBe("session");
  const cookie = parts(sessionCookie(TOKEN));
  expect(cookie[0]).toBe(`session=${TOKEN}`);
  expect(cookie.slice(1).sort()).toEqual(["HttpOnly", "Max-Age=604800", "Path=/", "SameSite=Strict"]);
});

it("a lookalike http origin does not drop Secure", () => {
  vi.stubEnv("SITE_ORIGIN", "https://localhost.example.com");
  expect(cookieName()).toBe("__Host-session");
  expect(parts(sessionCookie(TOKEN))).toContain("Secure");
});

it("clearSessionCookie empties the value with Max-Age=0 and the same flags", () => {
  const cookie = parts(clearSessionCookie());
  expect(cookie[0]).toBe("__Host-session=");
  expect(cookie.slice(1).sort()).toEqual(["HttpOnly", "Max-Age=0", "Path=/", "SameSite=Strict", "Secure"]);
});

it("sessionCookie refuses a malformed token (no header injection)", () => {
  expect(() => sessionCookie("abc; Domain=evil.com")).toThrow();
  expect(() => sessionCookie(TOKEN + "\r\nX: y")).toThrow();
});

it("readSessionToken finds the cookie among others", () => {
  expect(readSessionToken(withCookie(`theme=dark; __Host-session=${TOKEN}; other=a=b`))).toBe(TOKEN);
  expect(readSessionToken(withCookie(`a=1;__Host-session=${TOKEN};b=2`))).toBe(TOKEN);
  expect(readSessionToken(withCookie(`  __Host-session = ${TOKEN}  `))).toBe(TOKEN);
});

it("readSessionToken takes the first of duplicate cookies and keeps '=' in values", () => {
  expect(readSessionToken(withCookie(`__Host-session=${TOKEN}; __Host-session=second`))).toBe(TOKEN);
  expect(readSessionToken(withCookie("__Host-session=a=b=c"))).toBe("a=b=c");
});

it("readSessionToken ignores similar names and the other mode's name", () => {
  expect(readSessionToken(withCookie(`session=${TOKEN}; x__Host-session=${TOKEN}`))).toBeNull();
  vi.stubEnv("SITE_ORIGIN", "http://localhost:8888");
  expect(readSessionToken(withCookie(`__Host-session=${TOKEN}`))).toBeNull();
  expect(readSessionToken(withCookie(`session=${TOKEN}`))).toBe(TOKEN);
});

it("readSessionToken returns null for garbage", () => {
  expect(readSessionToken(withCookie(null))).toBeNull();
  expect(readSessionToken(withCookie(""))).toBeNull();
  expect(readSessionToken(withCookie("garbage"))).toBeNull();
  expect(readSessionToken(withCookie(";;; = ;"))).toBeNull();
  expect(readSessionToken(withCookie("__Host-session="))).toBeNull();
  expect(readSessionToken(withCookie("__Host-session"))).toBeNull();
});

it("validateSession rejects null and malformed tokens without touching the DB", async () => {
  const none = { valid: false, renewed: false };
  expect(await validateSession(null)).toEqual(none);
  for (const bad of ["", "x", "%00", "x".repeat(5 * 1024), "A".repeat(42), "A".repeat(44), "A".repeat(42) + "=", "A".repeat(42) + "+", "A".repeat(42) + "\n"]) {
    expect(await validateSession(bad)).toEqual(none);
  }
});

it("deleteSession ignores malformed tokens without touching the DB", async () => {
  await expect(deleteSession("x")).resolves.toBeUndefined();
});

it("requireAdmin throws unauthorized with no cookie", async () => {
  const error = await requireAdmin(withCookie(null)).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(HttpError);
  expect((error as HttpError).code).toBe("unauthorized");
  expect((error as HttpError).message).toBe("Please log in.");
});

it("checkOrigin passes the exact origin", () => {
  expect(originError(withCookie(null, { method: "POST", origin: ORIGIN }))).toBeUndefined();
});

it("checkOrigin rejects another origin, a lookalike, a missing header, \"null\"", () => {
  for (const origin of ["https://evil.com", "https://www.yznmoh.com.evil.com", "null", `${ORIGIN}/`, "http://www.yznmoh.com", "HTTPS://WWW.YZNMOH.COM", `${ORIGIN}:443`, ""]) {
    const error = originError(withCookie(null, { method: "POST", origin }));
    expect(error, origin).toBeInstanceOf(HttpError);
    expect(error?.code).toBe("forbidden_origin");
  }
  expect(originError(withCookie(null, { method: "POST" }))?.code).toBe("forbidden_origin");
});

it("Origin null is always rejected", () => {
  for (const site of [ORIGIN, "http://localhost:8888"]) {
    vi.stubEnv("SITE_ORIGIN", site);
    expect(originError(withCookie(null, { method: "POST", origin: "null" }))?.code, site).toBe("forbidden_origin");
  }
});

it("SITE_ORIGIN=null rejects Origin null", () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("SITE_ORIGIN", "null");
  expect(originError(withCookie(null, { method: "POST", origin: "null" }))?.code).toBe("forbidden_origin");
  expect(log).toHaveBeenCalled();
});

it("SITE_ORIGIN with trailing slash or path rejects all writes", () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  for (const site of [`${ORIGIN}/`, `${ORIGIN}/admin`, "HTTPS://WWW.YZNMOH.COM", "http://www.yznmoh.com", "http://localhost.evil.com", "ftp://www.yznmoh.com", "https://user@www.yznmoh.com", "not a url"]) {
    vi.stubEnv("SITE_ORIGIN", site);
    log.mockClear();
    // Even an Origin header equal to the bad value is refused.
    expect(originError(withCookie(null, { method: "POST", origin: site }))?.code, site).toBe("forbidden_origin");
    expect(originError(withCookie(null, { method: "POST", origin: ORIGIN }))?.code, site).toBe("forbidden_origin");
    // One log per misconfigured value, naming the variable but not echoing it.
    expect(log, site).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0][0])).toContain("SITE_ORIGIN");
    expect(log.mock.calls.flat().join(" ")).not.toContain(site);
  }
});

it("checkOrigin accepts a valid local http origin", () => {
  vi.stubEnv("SITE_ORIGIN", "http://127.0.0.1:8888");
  expect(originError(withCookie(null, { method: "POST", origin: "http://127.0.0.1:8888" }))).toBeUndefined();
});

it("adminHandler checks origin before session on writes", async () => {
  const fn = vi.fn(async () => json({ ok: true }));
  const response = await adminHandler(fn)(withCookie(null, { method: "POST", origin: "https://evil.com" }), ctx);
  expect(response.status).toBe(403);
  expect((await response.json()).error.code).toBe("forbidden_origin");
  const missing = await adminHandler(fn)(withCookie(null, { method: "DELETE" }), ctx);
  expect(missing.status).toBe(403);
  expect(fn).not.toHaveBeenCalled();
});

it("adminHandler returns 401 for a write with the right origin but no cookie", async () => {
  const fn = vi.fn(async () => json({ ok: true }));
  const response = await adminHandler(fn)(withCookie(null, { method: "PUT", origin: ORIGIN }), ctx);
  expect(response.status).toBe(401);
  expect(fn).not.toHaveBeenCalled();
});

it("adminHandler returns 401 for GET without cookie", async () => {
  const fn = vi.fn(async () => json({ ok: true }));
  const response = await adminHandler(fn)(withCookie(null, { origin: "https://evil.com" }), ctx);
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: { code: "unauthorized", message: "Please log in." } });
  expect(response.headers.get("Set-Cookie")).toBeNull();
  expect(fn).not.toHaveBeenCalled();
});
