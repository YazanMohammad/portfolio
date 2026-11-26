import { beforeEach, describe, expect, it } from "vitest";
import { count } from "drizzle-orm";
import { db } from "../../db/client";
import { adminAccount, adminSessions, education, experience, loginAttempts, messages, profile, projects, siteState, skills } from "../../db/schema";
import { cookieName } from "../../server/sessions";
import { ADMIN_ROUTES, FOREIGN, READ_ROUTES, WRITE_ROUTES, errorCode, label, send } from "./admin-routes";
import { blobStore, loginCookie, purgeSpy, resetDb, seedMinimal, testSession } from "./helpers";
import { describeDb } from "./describe-db";

// OWED-DB: needs the isolated test database. The database-free checks live in admin-routes.unit.test.ts.
const DAY = 24 * 60 * 60_000;
const TABLES = { adminAccount, profile, projects, experience, education, skills, messages, loginAttempts, adminSessions, siteState };

async function rowCounts(): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const [name, table] of Object.entries(TABLES)) {
    const [row] = await db.select({ n: count() }).from(table);
    result[name] = row.n;
  }
  return result;
}

describeDb("OWED-DB admin routes (real DB)", () => {
  let valid: string;
  let expired: string;
  beforeEach(async () => {
    await resetDb();
    await seedMinimal();
    valid = await loginCookie();
    // Created 8 days ago, so it expired a day ago. Made last: a later login could clean it up.
    expired = `${cookieName()}=${(await testSession(new Date(Date.now() - 8 * DAY))).token}`;
  });

  it.each(ADMIN_ROUTES.map(route => [label(route), route] as const))("expired session -> 401: %s", async (_name, route) => {
    const response = await send(route, { cookie: expired });
    expect(response.status).toBe(401);
    expect(await errorCode(response)).toBe("unauthorized");
    expect(response.headers.get("Set-Cookie")).toBeNull();
  });

  it.each(READ_ROUTES.map(route => [label(route), route] as const))("valid session passes the guard: %s", async (_name, route) => {
    const response = await send(route, { cookie: valid });
    expect(response.status).toBe(200);
  });

  it("no database write happened on rejected requests", async () => {
    const before = await rowCounts();
    const sessionsBefore = await db.select().from(adminSessions);
    for (const route of ADMIN_ROUTES) {
      expect((await send(route)).status, label(route)).toBe(401);
      expect((await send(route, { cookie: expired })).status, label(route)).toBe(401);
      expect((await send(route, { cookie: `${cookieName()}=garbage` })).status, label(route)).toBe(401);
    }
    for (const route of WRITE_ROUTES) {
      expect((await send(route, { origin: FOREIGN, cookie: valid })).status, label(route)).toBe(403);
      expect((await send(route, { origin: null, cookie: valid })).status, label(route)).toBe(403);
      expect((await send(route, { origin: FOREIGN })).status, label(route)).toBe(403);
    }
    expect(await rowCounts()).toEqual(before);
    // The session rows are unchanged too: rejected writes neither renew nor delete them.
    expect(await db.select().from(adminSessions)).toEqual(sessionsBefore);
    expect(blobStore.size).toBe(0);
    expect(purgeSpy).not.toHaveBeenCalled();
  });
});
