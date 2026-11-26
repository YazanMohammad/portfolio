import type { Context } from "@netlify/functions";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ reserve: vi.fn(), success: vi.fn(), verify: vi.fn(), create: vi.fn(), remove: vi.fn(), select: vi.fn() }));
vi.mock("../../db/client", () => ({ db: { select: mocks.select } }));
vi.mock("../../server/rate-limit", () => ({ reserveLoginAttempt: mocks.reserve, markLoginSuccess: mocks.success }));
vi.mock("../../server/password", () => ({ verifyPassword: mocks.verify }));
vi.mock("../../server/sessions", async (original) => ({ ...await original<typeof import("../../server/sessions")>(), createSession: mocks.create, deleteSession: mocks.remove }));
import login, { loginDelayMs } from "../../netlify/functions/auth-login";
import { DUMMY_HASH } from "../../server/admin-account";
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
const ACCOUNT = { username: "Admin", passwordHash: "configured" };
let accountRows: { username: string; passwordHash: string }[] = [ACCOUNT];
function request(body: unknown = { username: "admin", password: "right" }, method = "POST", origin = "https://site.test", cookie?: string) {
  const headers = new Headers({ Origin: origin, "Content-Type": "application/json" });
  if (cookie) headers.set("Cookie", cookie);
  return new Request("https://site.test/api/auth/login", { method, headers, ...(method === "POST" ? { body: JSON.stringify(body) } : {}) });
}
const WRONG = { error: { code: "unauthorized", message: "Wrong username or password." } };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SITE_ORIGIN", "https://site.test"); vi.stubEnv("SESSION_SECRET", Buffer.alloc(32, 7).toString("base64"));
  accountRows = [ACCOUNT];
  mocks.reserve.mockResolvedValue({ allowed: true, attemptId: 17 }); mocks.success.mockResolvedValue(undefined); mocks.verify.mockResolvedValue(true);
  mocks.create.mockResolvedValue({ token, expiresAt: new Date() }); mocks.remove.mockResolvedValue(undefined);
  mocks.select.mockImplementation(() => ({ from: () => ({ where: async () => accountRows }) }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
it("reserves then verifies, marks success, deletes old cookie before creating a session", async () => {
  const response = await login(request(undefined, "POST", "https://site.test", "__Host-session=" + "o".repeat(43)), ctx);
  expect(response.status).toBe(204); expect(await response.text()).toBe("");
  expect(response.headers.get("Set-Cookie")).toBe(`__Host-session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800`);
  const hash = hashIp(ctx.ip);
  expect(mocks.reserve).toHaveBeenCalledWith(hash); expect(mocks.success).toHaveBeenCalledWith(hash, 17);
  expect(mocks.verify).toHaveBeenCalledOnce(); expect(mocks.verify).toHaveBeenCalledWith("right", "configured");
  expect(mocks.remove).toHaveBeenCalledWith("o".repeat(43));
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
it.each(["ADMIN", "  admin  ", "Admin"])("username %j matches case-insensitively after trimming", async (username) => {
  expect((await login(request({ username, password: "right" }), ctx)).status).toBe(204);
  expect(mocks.verify).toHaveBeenCalledExactlyOnceWith("right", "configured");
});
it("wrong username still runs one scrypt verify, against the dummy hash, and gets the generic 401", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const response = await login(request({ username: "someone", password: "right" }), ctx);
  expect(response.status).toBe(401); expect(await response.json()).toEqual(WRONG);
  expect(mocks.verify).toHaveBeenCalledExactlyOnceWith("right", DUMMY_HASH);
  expect(mocks.success).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
});
it("wrong password runs one verify against the stored hash and gets the generic 401", async () => {
  mocks.verify.mockResolvedValue(false);
  const response = await login(request(), ctx);
  expect(response.status).toBe(401); expect(await response.json()).toEqual(WRONG);
  expect(mocks.verify).toHaveBeenCalledExactlyOnceWith("right", "configured");
  expect(mocks.success).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
});
it("the dummy hash is a well-formed scrypt hash, so the no-match path does full scrypt work", () => {
  expect(DUMMY_HASH).toMatch(/^scrypt\$16384\$8\$1\$[A-Za-z0-9+/]+={0,2}\$[A-Za-z0-9+/]+={0,2}$/);
});
it("no admin account: verify still runs, generic 401, and one log line per instance without secrets", async () => {
  vi.resetModules();
  const { default: freshLogin } = await import("../../netlify/functions/auth-login");
  const { DUMMY_HASH: dummy } = await import("../../server/admin-account");
  accountRows = [];
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  for (let i = 0; i < 2; i++) {
    const response = await freshLogin(request(), ctx);
    expect(response.status).toBe(401); expect(await response.json()).toEqual(WRONG);
  }
  expect(mocks.verify).toHaveBeenCalledTimes(2);
  for (const call of mocks.verify.mock.calls) expect(call).toEqual(["right", dummy]);
  expect(error.mock.calls).toEqual([["No admin account. Run admin:create."]]);
  expect(mocks.create).not.toHaveBeenCalled();
});
it.each(["wrong password", "wrong username", "no account", "malformed stored hash"])("%s waits 500ms from entry", async (kind) => {
  vi.useFakeTimers();
  const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});
  let body = { username: "admin", password: "right" };
  if (kind === "wrong password") mocks.verify.mockResolvedValue(false);
  if (kind === "wrong username") body = { username: "nobody", password: "right" };
  if (kind === "no account") accountRows = [];
  if (kind === "malformed stored hash") {
    accountRows = [{ username: "Admin", passwordHash: "malformed-secret-do-not-log" }];
    const real = await vi.importActual<typeof import("../../server/password")>("../../server/password");
    mocks.verify.mockImplementation(real.verifyPassword);
  }
  // Reservation consumes 200ms: delay must count it, not start after verification.
  mocks.reserve.mockImplementationOnce(async () => { await new Promise(r => setTimeout(r, 200)); return { allowed: true, attemptId: 17 }; });
  let finished = false;
  const pending = login(request(body), ctx).then(response => { finished = true; return response; });
  await vi.advanceTimersByTimeAsync(499); expect(finished).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  const response = await pending;
  expect(loginDelayMs).toBe(500); expect(response.status).toBe(401);
  expect(await response.json()).toEqual(WRONG);
  expect(mocks.verify).toHaveBeenCalledOnce();
  expect(mocks.success).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
  expect(JSON.stringify(diagnostic.mock.calls)).not.toContain("malformed-secret-do-not-log");
});
it("does not add 500ms after a slow verification", async () => {
  vi.useFakeTimers(); vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.verify.mockImplementationOnce(async () => { await new Promise(r => setTimeout(r, 700)); return false; });
  const pending = login(request(), ctx);
  await vi.advanceTimersByTimeAsync(700);
  expect((await pending).status).toBe(401); expect(vi.getTimerCount()).toBe(0);
});
it("refused reservation returns Retry-After without account lookup or password work", async () => {
  mocks.reserve.mockResolvedValue({ allowed: false, retryAfter: 83 });
  const response = await login(request(), ctx);
  expect(response.status).toBe(429); expect(response.headers.get("Retry-After")).toBe("83");
  expect(mocks.select).not.toHaveBeenCalled();
  expect(mocks.verify).not.toHaveBeenCalled(); expect(mocks.success).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
});
it.each([{}, [], { password: "right" }, { username: "admin", password: 5 }, { username: 5, password: "right" },
  { username: "admin", password: "right", extra: true }, { username: "admin", password: "" }, { username: "", password: "right" }])("rejects invalid login %j before reservation", async (body) => {
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
