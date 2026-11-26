import { beforeEach, expect, it } from "vitest";
import { db } from "../../db/client";
import { adminAccount, adminSessions } from "../../db/schema";
import account from "../../netlify/functions/admin-account";
import login from "../../netlify/functions/auth-login";
import me from "../../netlify/functions/auth-me";
import { verifyPassword } from "../../server/password";
import { cookieName, createSession } from "../../server/sessions";
import { call, createTestAdmin, loginCookie, resetDb, TEST_PASSWORD, TEST_USERNAME } from "./helpers";
import { describeDb } from "./describe-db";

const NEW_PASSWORD = "a brand new password";
const put = (json: unknown, cookie?: string, extra: { origin?: string; ip?: string } = {}) =>
  call(account, { method: "PUT", path: "/api/admin/account", json, cookie, ...extra });
const sessionCookies = (response: Response) =>
  response.headers.getSetCookie().filter(value => value.startsWith(`${cookieName()}=`));
const cookieOf = (response: Response) => sessionCookies(response)[0].split(";")[0];
const getMe = (cookie: string) => call(me, { path: "/api/auth/me", cookie });
const signIn = (username: string, password: string) =>
  call(login, { method: "POST", path: "/api/auth/login", json: { username, password }, ip: "203.0.113.50" });
const stored = async () => (await db.select().from(adminAccount))[0];

describeDb("admin account route (real db)", () => {
  let cookie: string;
  beforeEach(async () => { await resetDb(); await createTestAdmin(); cookie = await loginCookie(); });

  it("GET returns only the username, never the hash", async () => {
    const response = await call(account, { path: "/api/admin/account", cookie });
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ username: TEST_USERNAME });
    expect(text).not.toContain("scrypt");
    expect(text).not.toMatch(/hash/i);
  });

  it("without a session is 401; a foreign origin is 403; nothing changes", async () => {
    const before = await stored();
    expect((await put({ currentPassword: TEST_PASSWORD, username: "other" })).status).toBe(401);
    expect((await put({ currentPassword: TEST_PASSWORD, username: "other" }, cookie, { origin: "https://foreign.test" })).status).toBe(403);
    expect(await stored()).toEqual(before);
  });

  it.each([
    [{ username: "other" }, "currentPassword"],
    [{ currentPassword: TEST_PASSWORD, username: "ab" }, "username"],
    [{ currentPassword: TEST_PASSWORD, username: "x".repeat(65) }, "username"],
    [{ currentPassword: TEST_PASSWORD, username: TEST_USERNAME, newPassword: "too short" }, "newPassword"],
    [{ currentPassword: TEST_PASSWORD, username: TEST_USERNAME, extra: 1 }, ""],
  ])("invalid body %j is 400 with a field error", async (json, field) => {
    const before = await stored();
    const response = await put(json, cookie);
    expect(response.status).toBe(400);
    expect(Object.keys((await response.json()).error.fields)).toContain(field);
    expect(await stored()).toEqual(before);
  });

  it("wrong current password is 401 on that field and changes nothing", async () => {
    const before = await stored();
    const response = await put({ currentPassword: "not the password", username: "other", newPassword: NEW_PASSWORD }, cookie);
    expect(response.status).toBe(401);
    expect((await response.json()).error).toMatchObject({ code: "unauthorized", fields: { currentPassword: "Wrong password." } });
    expect(await stored()).toEqual(before);
    expect((await getMe(cookie)).status).toBe(200);
  });

  it("wrong current passwords share the login rate limit", async () => {
    for (let i = 0; i < 5; i++) expect((await put({ currentPassword: "wrong", username: TEST_USERNAME }, cookie)).status).toBe(401);
    const response = await put({ currentPassword: TEST_PASSWORD, username: TEST_USERNAME }, cookie);
    expect(response.status).toBe(429); expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("username change keeps the password, rotates this session and ends every other one", async () => {
    const other = await loginCookie();
    const before = await stored();
    const response = await put({ currentPassword: TEST_PASSWORD, username: "  New-Name " }, cookie);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ username: "New-Name" });
    const after = await stored();
    expect(after.username).toBe("New-Name");
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(after.updatedAt.getTime()).toBeGreaterThanOrEqual(before.updatedAt.getTime());
    const rotated = cookieOf(response);
    expect(rotated).not.toBe(cookie);
    expect((await getMe(cookie)).status).toBe(401);
    expect((await getMe(other)).status).toBe(401);
    expect((await getMe(rotated)).status).toBe(200);
    expect(await db.select().from(adminSessions)).toHaveLength(1);
    expect((await signIn("new-name", TEST_PASSWORD)).status).toBe(204);
  });

  it("password change: the new one logs in, the old one does not", async () => {
    const response = await put({ currentPassword: TEST_PASSWORD, username: TEST_USERNAME, newPassword: NEW_PASSWORD }, cookie);
    expect(response.status).toBe(200);
    const { passwordHash } = await stored();
    expect(await verifyPassword(NEW_PASSWORD, passwordHash)).toBe(true);
    expect((await signIn(TEST_USERNAME, TEST_PASSWORD)).status).toBe(401);
    expect((await signIn(TEST_USERNAME, NEW_PASSWORD)).status).toBe(204);
  });

  it("a session due for renewal still gets exactly one (the new) session cookie", async () => {
    const old = `${cookieName()}=${(await createSession(new Date(Date.now() - 2 * 60 * 60_000))).token}`;
    const response = await put({ currentPassword: TEST_PASSWORD, username: TEST_USERNAME }, old);
    expect(response.status).toBe(200);
    expect(sessionCookies(response)).toHaveLength(1);
    expect(cookieOf(response)).not.toBe(old);
    expect((await getMe(cookieOf(response))).status).toBe(200);
  });
});
