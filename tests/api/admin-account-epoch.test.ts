import { sql } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

// Pauses the Account PUT after adminHandler has validated the session but before the handler
// reads the account (checkAdminPassword), the gap the authorized-epoch binding must close.
const gate = vi.hoisted(() => ({ hold: null as null | { reached: () => void; release: Promise<void> } }));
vi.mock("../../server/admin-account", async (original) => {
  const real = await original<typeof import("../../server/admin-account")>();
  return {
    ...real,
    checkAdminPassword: async (password: string) => {
      const hold = gate.hold;
      if (hold) { gate.hold = null; hold.reached(); await hold.release; }
      return real.checkAdminPassword(password);
    },
  };
});

import { db } from "../../db/client";
import { adminAccount, adminSessions } from "../../db/schema";
import account from "../../netlify/functions/admin-account";
import me from "../../netlify/functions/auth-me";
import { saveAdminAccount } from "../../server/admin-account";
import { cookieName } from "../../server/sessions";
import { call, createTestAdmin, loginCookie, resetDb, TEST_PASSWORD, TEST_USERNAME } from "./helpers";
import { describeDb } from "./describe-db";

function holdNextAccountRead() {
  let reached!: () => void;
  let release!: () => void;
  const reachedPromise = new Promise<void>(resolve => { reached = resolve; });
  gate.hold = { reached, release: new Promise<void>(resolve => { release = resolve; }) };
  return { reached: reachedPromise, release };
}
const put = (json: unknown, cookie: string) => call(account, { method: "PUT", path: "/api/admin/account", json, cookie });
const getMe = (cookie: string) => call(me, { path: "/api/auth/me", cookie });
const sessionCookies = (response: Response) => response.headers.getSetCookie().filter(v => v.startsWith(`${cookieName()}=`));
const stored = async () => (await db.select().from(adminAccount))[0];

async function expectRejectedWithoutEffect(responseB: Response, before: Awaited<ReturnType<typeof stored>>) {
  expect([401, 409]).toContain(responseB.status);
  expect(sessionCookies(responseB)).toEqual([]);
  expect(await stored()).toEqual(before);
}

describeDb("account change bound to the authorizing session (real db)", () => {
  beforeEach(async () => { gate.hold = null; await resetDb(); await createTestAdmin(); });

  it("rotation by a username-only Account change (same password) while B is between auth and account read", async () => {
    const cookieA = await loginCookie();
    const cookieB = await loginCookie();
    const held = holdNextAccountRead();
    const pendingB = put({ currentPassword: TEST_PASSWORD, username: "b-wins" }, cookieB);
    await held.reached;
    const responseA = await put({ currentPassword: TEST_PASSWORD, username: "a-name" }, cookieA);
    expect(responseA.status).toBe(200);
    const rotatedA = sessionCookies(responseA)[0].split(";")[0];
    const before = await stored();
    held.release();
    const responseB = await pendingB;
    expect(responseB.status).toBe(409);
    await expectRejectedWithoutEffect(responseB, before);
    expect(before.username).toBe("a-name");
    expect((await getMe(rotatedA)).status).toBe(200);
    expect((await getMe(cookieB)).status).toBe(401);
    expect(await db.select().from(adminSessions)).toHaveLength(1);
  });

  it("rotation by a CLI reset with the same username and hash while B is between auth and account read", async () => {
    const cookieB = await loginCookie();
    const { passwordHash } = await stored();
    const held = holdNextAccountRead();
    const pendingB = put({ currentPassword: TEST_PASSWORD, username: "b-wins" }, cookieB);
    await held.reached;
    await saveAdminAccount(TEST_USERNAME, passwordHash);
    const before = await stored();
    held.release();
    await expectRejectedWithoutEffect(await pendingB, before);
    expect(await db.select().from(adminSessions)).toHaveLength(0);
  });

  it("a version bump that keeps B's session row still rejects B (bound to the authorized epoch, not a fresh read)", async () => {
    const cookieB = await loginCookie();
    const held = holdNextAccountRead();
    const pendingB = put({ currentPassword: TEST_PASSWORD, username: "b-wins", newPassword: "a brand new password" }, cookieB);
    await held.reached;
    await db.update(adminAccount).set({ version: sql`${adminAccount.version} + 1` });
    const before = await stored();
    held.release();
    await expectRejectedWithoutEffect(await pendingB, before);
  });

  it("B's session revoked (logout) while it waits: B's change is not applied", async () => {
    const cookieB = await loginCookie();
    const held = holdNextAccountRead();
    const pendingB = put({ currentPassword: TEST_PASSWORD, username: "b-wins" }, cookieB);
    await held.reached;
    await db.delete(adminSessions);
    const before = await stored();
    held.release();
    await expectRejectedWithoutEffect(await pendingB, before);
    expect(await db.select().from(adminSessions)).toHaveLength(0);
  });
});
