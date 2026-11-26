import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../db/client";
import { adminSessions } from "../../db/schema";
import login from "../../netlify/functions/auth-login";
import logout from "../../netlify/functions/auth-logout";
import me from "../../netlify/functions/auth-me";
import { call, createTestAdmin, resetDb, TEST_PASSWORD, TEST_USERNAME } from "./helpers";
import { describeDb } from "./describe-db";

// OWED-DB: run only after an isolated disposable branch is independently verified.
describeDb("auth (real db)", () => {
  beforeEach(async () => { await resetDb(); await createTestAdmin(); });
  const signIn = (password = TEST_PASSWORD, ip = "203.0.113.10", cookie?: string, username = TEST_USERNAME) => call(login, {
    method: "POST", path: "/api/auth/login", json: { username, password }, ip, cookie,
  });
  const getMe = (cookie?: string) => call(me, { path: "/api/auth/me", cookie });
  async function signedIn() {
    const response = await signIn();
    expect(response.status).toBe(204);
    return response.headers.get("Set-Cookie")!.split(";")[0];
  }
  it("right password sets the secure cookie and no token body", async () => {
    const response = await signIn();
    expect(response.status).toBe(204); expect(await response.text()).toBe("");
    expect(response.headers.get("Set-Cookie")).toMatch(/^__Host-session=[A-Za-z0-9_-]{43}; HttpOnly; Secure; SameSite=Strict; Path=\/; Max-Age=604800$/);
  });
  it("wrong password is 401 after at least 500ms", async () => {
    const started = performance.now(); const response = await signIn("wrong");
    expect(performance.now() - started).toBeGreaterThanOrEqual(500);
    expect(response.status).toBe(401); expect((await response.json()).error.message).toBe("Wrong username or password.");
  });
  it("wrong username is the same generic 401 after at least 500ms", async () => {
    const started = performance.now(); const response = await signIn(TEST_PASSWORD, "203.0.113.10", undefined, "someone-else");
    expect(performance.now() - started).toBeGreaterThanOrEqual(500);
    expect(response.status).toBe(401); expect((await response.json()).error.message).toBe("Wrong username or password.");
  });
  it("username is case-insensitive and trimmed", async () => {
    expect((await signIn(TEST_PASSWORD, "203.0.113.10", undefined, "  TEST-Admin ")).status).toBe(204);
  });
  it("wrong usernames count toward the rate limit too", async () => {
    for (let i = 0; i < 5; i++) expect((await signIn(TEST_PASSWORD, "203.0.113.11", undefined, "nobody")).status).toBe(401);
    expect((await signIn(TEST_PASSWORD, "203.0.113.11")).status).toBe(429);
  });
  it.each([{}, [], { password: TEST_PASSWORD }, { username: TEST_USERNAME, password: 5 },
    { username: TEST_USERNAME, password: TEST_PASSWORD, extra: true }, { username: TEST_USERNAME, password: "" }])("invalid input %j is 400", async json => {
    expect((await call(login, { method: "POST", path: "/api/auth/login", json })).status).toBe(400);
  });
  it.each(["", "{bad"])("invalid JSON %j is 400", async body => {
    expect((await login(new Request("https://site.test/api/auth/login", { method: "POST", headers: { Origin: "https://site.test" }, body }), {} as Parameters<typeof login>[1])).status).toBe(400);
  });
  it("five failures then right password is 429; another IP remains allowed", async () => {
    for (let i = 0; i < 5; i++) expect((await signIn("wrong")).status).toBe(401);
    const response = await signIn();
    expect(response.status).toBe(429); expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect((await signIn(TEST_PASSWORD, "203.0.113.12")).status).toBe(204);
  });
  it("foreign login origin is forbidden", async () => {
    expect((await call(login, { method: "POST", path: "/api/auth/login", json: { username: TEST_USERNAME, password: TEST_PASSWORD }, origin: "https://foreign.test" })).status).toBe(403);
  });
  it("no admin account: generic 401 and one log line without secrets", async () => {
    await resetDb();
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await signIn(); expect(response.status).toBe(401);
      expect((await response.json()).error.message).toBe("Wrong username or password.");
      expect(JSON.stringify(diagnostic.mock.calls)).not.toContain(TEST_PASSWORD);
    } finally { vi.restoreAllMocks(); }
  });
  it("me without cookie is 401", async () => { expect((await getMe()).status).toBe(401); });
  it("me with cookie is authenticated", async () => {
    const response = await getMe(await signedIn()); expect(response.status).toBe(200); expect(await response.json()).toEqual({ authenticated: true });
  });
  it("me with garbage cookie is 401", async () => { expect((await getMe("__Host-session=garbage")).status).toBe(401); });
  it("logout deletes session and clears cookie", async () => {
    const cookie = await signedIn();
    const response = await call(logout, { method: "POST", path: "/api/auth/logout", cookie });
    expect(response.status).toBe(204); expect(response.headers.get("Set-Cookie")).toContain("Max-Age=0");
    expect((await getMe(cookie)).status).toBe(401); expect(await db.select().from(adminSessions)).toHaveLength(0);
  });
  it("logout foreign origin is forbidden and preserves session", async () => {
    const cookie = await signedIn();
    expect((await call(logout, { method: "POST", path: "/api/auth/logout", cookie, origin: "https://foreign.test" })).status).toBe(403);
    expect((await getMe(cookie)).status).toBe(200);
  });
  it("login rotates an old session", async () => {
    const old = await signedIn(); const response = await signIn(TEST_PASSWORD, "203.0.113.10", old);
    expect(response.status).toBe(204); expect((await getMe(old)).status).toBe(401);
    expect((await getMe(response.headers.get("Set-Cookie")!.split(";")[0])).status).toBe(200);
    expect(await db.select().from(adminSessions)).toHaveLength(1);
  });
  it("logout without session is 204", async () => {
    expect((await call(logout, { method: "POST", path: "/api/auth/logout" })).status).toBe(204);
  });
});
