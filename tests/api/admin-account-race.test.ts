import { sql } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

// Pauses the next verifyPassword after it has computed its answer, so a test can run another
// request in the gap between "password verified" and "account written / session created".
const gate = vi.hoisted(() => ({ hold: null as null | { reached: () => void; release: Promise<void> } }));
vi.mock("../../server/password", async (original) => {
  const real = await original<typeof import("../../server/password")>();
  return {
    ...real,
    verifyPassword: async (password: string, stored: string) => {
      const ok = await real.verifyPassword(password, stored);
      const hold = gate.hold;
      if (hold) { gate.hold = null; hold.reached(); await hold.release; }
      return ok;
    },
  };
});

import { db } from "../../db/client";
import { adminAccount, adminSessions } from "../../db/schema";
import account from "../../netlify/functions/admin-account";
import login from "../../netlify/functions/auth-login";
import me from "../../netlify/functions/auth-me";
import { saveAdminAccount } from "../../server/admin-account";
import { hashPassword, verifyPassword } from "../../server/password";
import { cookieName } from "../../server/sessions";
import { call, createTestAdmin, loginCookie, resetDb, TEST_PASSWORD, TEST_USERNAME } from "./helpers";
import { describeDb } from "./describe-db";

const NEW_PASSWORD = "a brand new password";

function holdNextVerify() {
  let reached!: () => void;
  let release!: () => void;
  const reachedPromise = new Promise<void>(resolve => { reached = resolve; });
  gate.hold = { reached, release: new Promise<void>(resolve => { release = resolve; }) };
  return { reached: reachedPromise, release };
}
const put = (json: unknown, cookie: string) => call(account, { method: "PUT", path: "/api/admin/account", json, cookie });
const signIn = (password: string) =>
  call(login, { method: "POST", path: "/api/auth/login", json: { username: TEST_USERNAME, password }, ip: "203.0.113.77" });
const getMe = (cookie: string) => call(me, { path: "/api/auth/me", cookie });
const sessionCookies = (response: Response) => response.headers.getSetCookie().filter(v => v.startsWith(`${cookieName()}=`));
const stored = async () => (await db.select().from(adminAccount))[0];

describeDb("admin account races (real db)", () => {
  beforeEach(async () => { gate.hold = null; await resetDb(); await createTestAdmin(); });

  it("a stale username-only PUT gets 409 and cannot restore the old password or mint a session", async () => {
    const cookieA = await loginCookie();
    const cookieB = await loginCookie();
    const held = holdNextVerify();
    const pendingB = put({ currentPassword: TEST_PASSWORD, username: "renamed" }, cookieB);
    await held.reached; // B has verified the old password and holds the old snapshot
    const responseA = await put({ currentPassword: TEST_PASSWORD, username: TEST_USERNAME, newPassword: NEW_PASSWORD }, cookieA);
    expect(responseA.status).toBe(200);
    const rotatedA = sessionCookies(responseA)[0].split(";")[0];
    held.release();
    const responseB = await pendingB;
    expect(responseB.status).toBe(409);
    expect((await responseB.json()).error).toMatchObject({ code: "conflict", message: "Your account changed. Reload and try again." });
    expect(sessionCookies(responseB)).toEqual([]);
    const after = await stored();
    expect(after.username).toBe(TEST_USERNAME);
    expect(await verifyPassword(NEW_PASSWORD, after.passwordHash)).toBe(true);
    expect(await verifyPassword(TEST_PASSWORD, after.passwordHash)).toBe(false);
    expect((await getMe(rotatedA)).status).toBe(200);
    expect(await db.select().from(adminSessions)).toHaveLength(1);
  });

  it("a login that verified the old password before a CLI reset gets 401 and no session", async () => {
    const held = holdNextVerify();
    const pending = signIn(TEST_PASSWORD);
    await held.reached;
    await saveAdminAccount(TEST_USERNAME, await hashPassword(NEW_PASSWORD));
    held.release();
    const response = await pending;
    expect(response.status).toBe(401);
    expect((await response.json()).error.message).toBe("Wrong username or password.");
    expect(sessionCookies(response)).toEqual([]);
    expect(await db.select().from(adminSessions)).toHaveLength(0);
  });

  it("a login that verified the old password before an Account password change gets 401 and no session", async () => {
    const cookie = await loginCookie();
    const held = holdNextVerify();
    const pending = signIn(TEST_PASSWORD);
    await held.reached;
    const changed = await put({ currentPassword: TEST_PASSWORD, username: TEST_USERNAME, newPassword: NEW_PASSWORD }, cookie);
    expect(changed.status).toBe(200);
    held.release();
    expect((await pending).status).toBe(401);
    const rows = await db.select().from(adminSessions);
    expect(rows).toHaveLength(1);
    expect(rows[0].accountVersion).toBe((await stored()).version);
  });

  it("a session issued for an older credential version stops working, even if its row survives", async () => {
    const cookie = await loginCookie();
    expect((await getMe(cookie)).status).toBe(200);
    await db.update(adminAccount).set({ version: sql`${adminAccount.version} + 1` });
    expect((await getMe(cookie)).status).toBe(401);
    expect(await db.select().from(adminSessions)).toHaveLength(1);
  });

  it("a session row without a credential version (issued before versioning) is not valid", async () => {
    const cookie = await loginCookie();
    await db.update(adminSessions).set({ accountVersion: null });
    expect((await getMe(cookie)).status).toBe(401);
  });

  it("with no account row no session can be created or used", async () => {
    const cookie = await loginCookie();
    await db.delete(adminAccount);
    expect((await getMe(cookie)).status).toBe(401);
  });
});
