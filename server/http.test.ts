import type { Context } from "@netlify/functions";
import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { env, isLocalHttp } from "./env";
import { fail, handle, HttpError, json, noContent, notFound, readJson } from "./http";
import { zodFields } from "./zod-fields";

const req = new Request("https://example.com/api");
const ctx = {} as Context;
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

it("handle maps HttpError validation to 400 with fields", async () => {
  const error = fail("validation", "Fix fields.", { fields: { name: "Required." } });
  expect(error).toBeInstanceOf(HttpError);
  const response = await handle(async () => { throw error; })(req, ctx);
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: { code: "validation", message: "Fix fields.", fields: { name: "Required." } } });
  expect(response.headers.get("Cache-Control")).toBe("no-store");
});
it("handle maps rate_limited to 429 with Retry-After", async () => {
  const response = await handle(async () => { throw fail("rate_limited", "Wait.", { retryAfter: 900 }); })(req, ctx);
  expect(response.status).toBe(429);
  expect(response.headers.get("Retry-After")).toBe("900");
  expect(await response.json()).toEqual({ error: { code: "rate_limited", message: "Wait." } });
});
it("handle hides internals on unknown error", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const response = await handle(async () => { throw new Error("secret database URL"); })(req, ctx);
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: { code: "server", message: "Something went wrong." } });
  expect(log).toHaveBeenCalled();
  expect(JSON.stringify(log.mock.calls)).not.toContain("secret database URL");
});
it("handle forwards the request, context and response", async () => {
  const response = json({ ok: true });
  const fn = vi.fn(async () => response);
  expect(await handle(fn)(req, ctx)).toBe(response);
  expect(fn).toHaveBeenCalledWith(req, ctx);
});
const schema = z.object({ name: z.string().trim().min(1) });
const request = (body: string) => new Request(req.url, { method: "POST", body });
it("readJson rejects invalid json with validation", async () => {
  await expect(readJson(request("{"), schema)).rejects.toMatchObject({ code: "validation", status: 400, fields: expect.any(Object) });
});
it("readJson rejects array body", async () => {
  for (const body of ["[]", "null", "42", "\"text\""]) {
    await expect(readJson(request(body), schema)).rejects.toMatchObject({ code: "validation", fields: expect.any(Object) });
  }
});
it("readJson returns parsed data", async () => {
  expect(await readJson(request('{"name":" Ada ","extra":1}'), schema)).toEqual({ name: "Ada" });
});
it("readJson maps schema errors to fields", async () => {
  await expect(readJson(request('{"name":""}'), schema)).rejects.toMatchObject({ code: "validation", fields: { name: expect.any(String) } });
});
it("json defaults to no-store", async () => {
  const response = json({ ok: true });
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(response.headers.get("Content-Type")).toContain("application/json");
  expect(await response.json()).toEqual({ ok: true });
});
it("json respects supplied status and headers", () => {
  const response = json({}, { status: 201, headers: new Headers({ "Cache-Control": "public", "X-Test": "yes" }) });
  expect(response.status).toBe(201);
  expect(response.headers.get("Cache-Control")).toBe("public");
  expect(response.headers.get("X-Test")).toBe("yes");
});
it("noContent returns an empty 204 with no-store and supplied headers", async () => {
  const response = noContent({ "Set-Cookie": "session=; Max-Age=0" });
  expect(response.status).toBe(204);
  expect(await response.text()).toBe("");
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(response.headers.get("Set-Cookie")).toBe("session=; Max-Age=0");
});
it("notFound returns the contract error", () => {
  expect(notFound()).toMatchObject({ code: "not_found", status: 404 });
});
it("zodFields joins paths and keeps the first message", () => {
  const err = new z.ZodError([
    { code: "custom", path: ["bullets", 2], message: "First." },
    { code: "custom", path: ["bullets", 2], message: "Second." },
    { code: "custom", path: [], message: "Root." },
    { code: "custom", path: ["__proto__"], message: "Safe." },
  ]);
  const fields = zodFields(err);
  expect(fields["bullets.2"]).toBe("First.");
  expect(fields[""]).toBe("Root.");
  expect(Object.hasOwn(fields, "__proto__")).toBe(true);
});
it("env reads at call time and names missing variables", () => {
  vi.stubEnv("SESSION_SECRET", "first");
  expect(env("SESSION_SECRET")).toBe("first");
  vi.stubEnv("SESSION_SECRET", "second");
  expect(env("SESSION_SECRET")).toBe("second");
  vi.stubEnv("SESSION_SECRET", "");
  expect(() => env("SESSION_SECRET")).toThrow("SESSION_SECRET");
});
it("isLocalHttp follows the local-http exception", () => {
  for (const [origin, expected] of [["http://localhost:8888", true], ["https://localhost", false], ["https://example.com", false]] as const) {
    vi.stubEnv("SITE_ORIGIN", origin);
    expect(isLocalHttp()).toBe(expected);
  }
});
it("localhost.evil.com is not local", () => {
  for (const origin of ["http://localhost.evil.com", "http://localhost.evil.com:8888", "http://localhostevil.com", "http://user@evil.com", "http://localhost@evil.com", "http://user:pw@localhost:8888"]) {
    vi.stubEnv("SITE_ORIGIN", origin);
    expect(isLocalHttp(), origin).toBe(false);
  }
});
it("http://127.0.0.1:8888 is local", () => {
  for (const origin of ["http://127.0.0.1:8888", "http://127.0.0.1", "http://[::1]:8888", "http://localhost"]) {
    vi.stubEnv("SITE_ORIGIN", origin);
    expect(isLocalHttp(), origin).toBe(true);
  }
});
it("https://localhost is not local http", () => {
  for (const origin of ["https://localhost", "https://127.0.0.1:8888", "ws://localhost", "null", "not a url", "localhost:8888"]) {
    vi.stubEnv("SITE_ORIGIN", origin);
    expect(isLocalHttp(), origin).toBe(false);
  }
});
it("readJson returns too_large (413) above the cap, not a JSON error", async () => {
  await expect(readJson(request(JSON.stringify({ name: "x".repeat(65537) })), schema)).rejects.toMatchObject({ code: "too_large", status: 413, message: "Request is too large." });
});
it("readJson cap counts UTF-8 bytes and accepts a larger per-route cap", async () => {
  const body = JSON.stringify({ name: "€".repeat(30000) }); // 90 KB in bytes, 30k chars
  await expect(readJson(request(body), schema)).rejects.toMatchObject({ code: "too_large" });
  expect((await readJson(request(body), schema, 128 * 1024)).name).toHaveLength(30000);
});
