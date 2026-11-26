import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { messages, siteState } from "../../db/schema";
import handler from "../../netlify/functions/admin-messages";
import { call, loginCookie, purgeSpy, resetDb, seedMinimal } from "./helpers";
import { describeDb } from "./describe-db";

// OWED-DB: do not execute without separately authorized isolated DB access.
describeDb("OWED-DB admin messages (real DB)", () => {
 let cookie: string;
 let ids: number[];
 const savedAt = new Date("2000-01-01");
 beforeEach(async () => {
  await resetDb(); await seedMinimal(); cookie = await loginCookie(); await db.insert(siteState).values({ lastSavedAt: savedAt });
  const rows = await db.insert(messages).values([
   { name: "Unread old", email: "p@example.com", message: "One", createdAt: new Date("2026-01-01"), ipHash: "private" },
   { name: "Read", email: "p@example.com", message: "Two", isRead: true, createdAt: new Date("2026-02-01") },
   { name: "Unread new", email: "p@example.com", message: "Three", createdAt: new Date("2026-03-01") },
   { name: "Archived unread", email: "p@example.com", message: "Four", archivedAt: new Date(), createdAt: new Date("2026-04-01") },
  ]).returning(); ids = rows.map(row => row.id);
 });
 const list = (status?: string) => call(handler, { path: "/api/admin/messages" + (status === undefined ? "" : `?status=${status}`), cookie });
 const patch = (id: string | number, json: unknown) => call(handler, { path: `/api/admin/messages/${id}`, method: "PATCH", cookie, json });
 const remove = (id: string | number) => call(handler, { path: `/api/admin/messages/${id}`, method: "DELETE", cookie });
 const unchangedContent = async () => { expect(purgeSpy).not.toHaveBeenCalled(); expect((await db.query.siteState.findFirst())?.lastSavedAt).toEqual(savedAt); };
 it.each([undefined, "all", "unread", "archived"])("status filter %s returns exact rows newest first", async status => { const response = await list(status); expect(response.status).toBe(200); const rows = await response.json(); const expected = status === "archived" ? [ids[3]] : status === "unread" ? [ids[2], ids[0]] : [ids[2], ids[1], ids[0]]; expect(rows.map((row: { id: number }) => row.id)).toEqual(expected); expect(rows[0]).not.toHaveProperty("ipHash"); await unchangedContent(); });
 it("tied createdAt sorts by id descending", async () => { await db.update(messages).set({ createdAt: new Date("2026-01-01") }); expect((await (await list()).json()).map((row: { id: number }) => row.id)).toEqual([ids[2], ids[1], ids[0]]); });
 it.each(["bad", "", "UNREAD"])("invalid status %s is 400 with fields", async status => { const response = await list(status); expect(response.status).toBe(400); expect((await response.json()).error.fields.status).toBeTruthy(); });
 it("PATCH isRead updates DB and unread filter, then can be set false", async () => { const response = await patch(ids[0], { isRead: true }); expect(response.status).toBe(200); expect((await response.json()).isRead).toBe(true); expect((await db.query.messages.findFirst({ where: eq(messages.id, ids[0]) }))?.isRead).toBe(true); expect((await (await list("unread")).json()).map((row: { id: number }) => row.id)).toEqual([ids[2]]); expect((await (await patch(ids[0], { isRead: false })).json()).isRead).toBe(false); await unchangedContent(); });
 it("PATCH archived then archived list contains it; unarchive clears archivedAt", async () => { const response = await patch(ids[0], { archived: true }); const body = await response.json(); expect(body.archivedAt).toMatch(/^\d{4}-/); expect((await db.query.messages.findFirst({ where: eq(messages.id, ids[0]) }))?.archivedAt).toBeInstanceOf(Date); expect((await (await list("archived")).json()).map((row: { id: number }) => row.id)).toContain(ids[0]); expect((await (await list()).json()).map((row: { id: number }) => row.id)).not.toContain(ids[0]); expect((await (await patch(ids[0], { archived: false })).json()).archivedAt).toBeNull(); expect((await db.query.messages.findFirst({ where: eq(messages.id, ids[0]) }))?.archivedAt).toBeNull(); await unchangedContent(); });
 it("PATCH both flags preserves content and createdAt", async () => { const before = await db.query.messages.findFirst({ where: eq(messages.id, ids[0]) }); const response = await patch(ids[0], { isRead: true, archived: true, message: "not editable" }); expect(response.status).toBe(200); const after = await db.query.messages.findFirst({ where: eq(messages.id, ids[0]) }); expect(after?.message).toBe(before?.message); expect(after?.createdAt).toEqual(before?.createdAt); expect(after?.isRead).toBe(true); expect(after?.archivedAt).toBeInstanceOf(Date); await unchangedContent(); });
 it.each([{}, { isRead: "true" }, { archived: null }, { message: "edit" }])("PATCH invalid %j is 400 and unchanged", async body => { const before = await db.query.messages.findFirst({ where: eq(messages.id, ids[0]) }); const response = await patch(ids[0], body); expect(response.status).toBe(400); expect((await response.json()).error.fields).toBeTruthy(); expect(await db.query.messages.findFirst({ where: eq(messages.id, ids[0]) })).toEqual(before); await unchangedContent(); });
 it("DELETE then GET list is gone and DB row is gone", async () => { const response = await remove(ids[0]); expect(response.status).toBe(204); expect(await response.text()).toBe(""); expect((await (await list()).json()).map((row: { id: number }) => row.id)).not.toContain(ids[0]); expect(await db.query.messages.findFirst({ where: eq(messages.id, ids[0]) })).toBeUndefined(); await unchangedContent(); });
 it.each([999999, "abc", "0", "-1", "1.2", "2147483648"])("unknown or invalid id %s is 404 for PATCH and DELETE", async id => { expect((await patch(id, { isRead: true })).status).toBe(404); expect((await remove(id)).status).toBe(404); });
 it("requires authentication and rejects foreign writes before auth", async () => { expect((await call(handler, { path: "/api/admin/messages" })).status).toBe(401); expect((await call(handler, { path: `/api/admin/messages/${ids[0]}`, method: "PATCH", origin: "https://foreign.test", json: {} })).status).toBe(403); await unchangedContent(); });
});
