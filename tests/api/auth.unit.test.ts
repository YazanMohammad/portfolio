import type { Context } from "@netlify/functions";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ reserve: vi.fn(), success: vi.fn(), verify: vi.fn(), create: vi.fn(), remove: vi.fn(), select: vi.fn() }));
vi.mock("../../db/client", () => ({ db: { select: mocks.select } }));
vi.mock("../../server/rate-limit", () => ({ reserveLoginAttempt: mocks.reserve, markLoginSuccess: mocks.success }));
vi.mock("../../server/password", () => ({ verifyPassword: mocks.verify }));
vi.mock("../../server/sessions", async (original) => ({ ...await original<typeof import("../../server/sessions")>(), createSession: mocks.create, deleteSession: mocks.remove }));
import login, { loginDelayMs } from "../../netlify/functions/auth-login";
import { hashIp } from "../../server/ip";

it("logout without a session clears the cookie without DB I/O", async () => {
  const { default: logout } = await import("../../netlify/functions/auth-logout");
  const response = await logout(request(), ctx);
  expect(response.status).toBe(204); expect(await response.text()).toBe("");
  expect(response.headers.get("Set-Cookie")).toBe("__Host-session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0");
  expect(mocks.remove).not.toHaveBeenCalled(); expect(mocks.select).not.toHaveBeenCalled();
});
it("logout deletes a present token and rejects foreign origin first", async () => {
  const { default: logout } = await import("../../netlify/functions/auth-logout");
  expect((await logout(request(undefined, "POST", "https://evil.test", "__Host-session=" + token), ctx)).status).toBe(403);
  expect(mocks.remove).not.toHaveBeenCalled();
  expect((await logout(request(undefined, "POST", "https://site.test", "__Host-session=" + token), ctx)).status).toBe(204);
  expect(mocks.remove).toHaveBeenCalledWith(token);
});
it.each([undefined, "garbage"])("me rejects absent or malformed cookie %s without DB", async value => {
  const { default: me } = await import("../../netlify/functions/auth-me");
  expect((await me(request(undefined, "GET", "https://site.test", value && "__Host-session=" + value), ctx)).status).toBe(401);
  expect(mocks.select).not.toHaveBeenCalled();
});
it("me authenticates through the real admin session wrapper", async () => {
  const { default: me } = await import("../../netlify/functions/auth-me");
  mocks.select.mockReturnValue({ from: () => ({ where: async () => [{ lastSeenAt: new Date() }] }) });
  const response = await me(request(undefined, "GET", "https://site.test", "__Host-session=" + token), ctx);
  expect(response.status).toBe(200); expect(await response.json()).toEqual({ authenticated: true });
  expect(response.headers.get("Cache-Control")).toBe("no-store");
});
it.each(["PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"])("logout and me reject %s before DB", async method => {
  const { default: logout } = await import("../../netlify/functions/auth-logout");
  const { default: me } = await import("../../netlify/functions/auth-me");
  expect((await logout(request(undefined, method), ctx)).status).toBe(404);
  expect((await me(request(undefined, method), ctx)).status).toBe(404);
  expect(mocks.remove).not.toHaveBeenCalled(); expect(mocks.select).not.toHaveBeenCalled();
});
it("me POST and logout GET return 404 before authentication", async () => {
  const { default: logout } = await import("../../netlify/functions/auth-logout");
  const { default: me } = await import("../../netlify/functions/auth-me");
  expect((await logout(request(undefined, "GET"), ctx)).status).toBe(404);
  expect((await me(request(), ctx)).status).toBe(404);
  expect(mocks.select).not.toHaveBeenCalled();
});

const ctx = { ip: "203.0.113.10" } as Context;
const token = "n".repeat(43);
function request(body: unknown = { password: "right" }, method = "POST", origin = "https://site.test", cookie?: string) {
  const headers = new Headers({ Origin: origin, "Content-Type": "application/json" });
  if (cookie) headers.set("Cookie", cookie);
  return new Request("https://site.test/api/auth/login", { method, headers, ...(method === "POST" ? { body: JSON.stringify(body) } : {}) });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SITE_ORIGIN", "https://site.test"); vi.stubEnv("SESSION_SECRET", Buffer.alloc(32, 7).toString("base64")); vi.stubEnv("ADMIN_PASSWORD_HASH", "configured");
  mocks.reserve.mockResolvedValue({ allowed: true, attemptId: 17 }); mocks.success.mockResolvedValue(undefined); mocks.verify.mockResolvedValue(true);
  mocks.create.mockResolvedValue({ token, expiresAt: new Date() }); mocks.remove.mockResolvedValue(undefined);
  mocks.select.mockReturnValue({ from: () => ({ where: async () => [] }) });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
it("reserves then verifies, marks success, deletes old cookie before creating a session", async () => {
  const response = await login(request(undefined, "POST", "https://site.test", "__Host-session=" + "o".repeat(43)), ctx);
  expect(response.status).toBe(204); expect(await response.text()).toBe("");
  expect(response.headers.get("Set-Cookie")).toBe(`__Host-session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800`);
  const hash = hashIp(ctx.ip);
  expect(mocks.reserve).toHaveBeenCalledWith(hash); expect(mocks.success).toHaveBeenCalledWith(hash, 17);
  expect(mocks.verify).toHaveBeenCalledWith("right", "configured"); expect(mocks.remove).toHaveBeenCalledWith("o".repeat(43));
  const order = [mocks.reserve, mocks.verify, mocks.success, mocks.remove, mocks.create].map(fn => fn.mock.invocationCallOrder[0]);
  expect(order).toEqual([...order].sort((a, b) => a - b));
});
it("successful login without an old cookie creates a session without deleting or logging secrets", async () => {
  const logs = [vi.spyOn(console, "log"), vi.spyOn(console, "error"), vi.spyOn(console, "warn")];
  const response = await login(request(), ctx);
  expect(response.status).toBe(204); expect(await response.text()).toBe("");
  expect(mocks.remove).not.toHaveBeenCalled(); expect(mocks.create).toHaveBeenCalledOnce();
  for (const log of logs) expect(log).not.toHaveBeenCalled();
});
it.each(["wrong", "missing", "malformed"])("%s password configuration or credential waits 500ms from entry", async (kind) => {
  vi.useFakeTimers();
  const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});
  if (kind === "missing") vi.stubEnv("ADMIN_PASSWORD_HASH", undefined);
  if (kind === "malformed") vi.stubEnv("ADMIN_PASSWORD_HASH", "malformed-secret-do-not-log");
  if (kind === "wrong") mocks.verify.mockResolvedValue(false);
  else {
    const real = await vi.importActual<typeof import("../../server/password")>("../../server/password");
    mocks.verify.mockImplementation(real.verifyPassword);
  }
  // Reservation consumes 200ms: delay must count it, not start after verification.
  mocks.reserve.mockImplementationOnce(async () => { await new Promise(r => setTimeout(r, 200)); return { allowed: true, attemptId: 17 }; });
  let finished = false;
  const pending = login(request(), ctx).then(response => { finished = true; return response; });
  await vi.advanceTimersByTimeAsync(499); expect(finished).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  const response = await pending;
  expect(loginDelayMs).toBe(500); expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: { code: "unauthorized", message: "Wrong password." } });
  expect(mocks.success).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
  expect(diagnostic).toHaveBeenCalled(); expect(JSON.stringify(diagnostic.mock.calls)).not.toContain("malformed-secret-do-not-log");
});
it("does not add 500ms after a slow verification", async () => {
  vi.useFakeTimers(); vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.verify.mockImplementationOnce(async () => { await new Promise(r => setTimeout(r, 700)); return false; });
  const pending = login(request(), ctx);
  await vi.advanceTimersByTimeAsync(700);
  expect((await pending).status).toBe(401); expect(vi.getTimerCount()).toBe(0);
});
it("refused reservation returns Retry-After without password work", async () => {
  mocks.reserve.mockResolvedValue({ allowed: false, retryAfter: 83 });
  const response = await login(request(), ctx);
  expect(response.status).toBe(429); expect(response.headers.get("Retry-After")).toBe("83");
  expect(mocks.verify).not.toHaveBeenCalled(); expect(mocks.success).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
});
it.each([{}, [], { password: 5 }, { password: "right", extra: true }, { password: "" }])("rejects invalid login %j before reservation", async (body) => {
  expect((await login(request(body), ctx)).status).toBe(400); expect(mocks.reserve).not.toHaveBeenCalled();
});
it.each(["", "{bad"])("invalid JSON %j is 400 before reservation", async body => {
  const req = new Request("https://site.test/api/auth/login", { method: "POST", headers: { Origin: "https://site.test" }, body });
  expect((await login(req, ctx)).status).toBe(400); expect(mocks.reserve).not.toHaveBeenCalled();
});
it("origin check runs before body parsing or reservation", async () => {
  const req = request({}, "POST", "https://evil.test"); const parse = vi.spyOn(req, "json");
  expect((await login(req, ctx)).status).toBe(403); expect(parse).not.toHaveBeenCalled(); expect(mocks.reserve).not.toHaveBeenCalled();
});
it.each(["GET", "HEAD", "OPTIONS", "PUT", "DELETE", "PATCH"])("login %s is 404 before I/O", async method => {
  expect((await login(request(undefined, method), ctx)).status).toBe(404); expect(mocks.reserve).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
});
