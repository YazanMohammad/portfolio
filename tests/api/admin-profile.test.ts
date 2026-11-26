import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/client";
import { profile, projects, siteState } from "../../db/schema";
import handler from "../../netlify/functions/admin-profile";
import { saveFile } from "../../server/blobs";
import type { ProfileInput } from "../../shared/index";
import { blobStore, call, CV_KEY, loginCookie, PHOTO_KEY, purgeSpy, resetDb, seedMinimal } from "./helpers";
import { describeDb } from "./describe-db";

// OWED-DB: explicit opt-in as well as the existing isolated-database safety guard.
describeDb("OWED-DB admin profile (real DB)", () => {
 let cookie: string;
 beforeEach(async () => { await resetDb(); await seedMinimal(); cookie = await loginCookie(); });
 const get = () => call(handler, { path: "/api/admin/profile", cookie });
 const input = async (): Promise<ProfileInput> => { const { updatedAt, ...body } = await (await get()).json(); void updatedAt; return body; };
 const put = (json: unknown) => call(handler, { path: "/api/admin/profile", method: "PUT", cookie, json });
 it("GET returns the admin Profile and no database-only fields", async () => { const response = await get(); expect(response.status).toBe(200); const body = await response.json(); expect(body.cvKey).toBe(CV_KEY); expect(body.photoKey).toBe(PHOTO_KEY); expect(body).not.toHaveProperty("id"); expect(body.updatedAt).toMatch(/^\d{4}-/); });
 it("PUT saves, returns Profile, updates updatedAt, and purges tag content", async () => {
  await db.update(profile).set({ updatedAt: new Date("2000-01-01") }); const body = { ...await input(), name: "Saved Person", about: "New about" }; const response = await put(body); expect(response.status).toBe(200); const saved = await response.json(); expect(saved).toEqual({ ...body, updatedAt: expect.any(String) }); expect(new Date(saved.updatedAt).getTime()).toBeGreaterThan(new Date("2000-01-01").getTime()); expect(await (await get()).json()).toEqual(saved); const row = await db.query.profile.findFirst(); expect(row?.name).toBe(body.name); expect(row?.updatedAt.toISOString()).toBe(saved.updatedAt); expect(purgeSpy).toHaveBeenCalledWith({ tags: ["content"] });
 });
 it.each([{ name: "" }, { email: "bad" }, { photoAlt: null }, { cvKey: "bad" }, { available: "yes" }])("invalid body is 400 with fields and no persistence: %j", async patch => { const before = await (await get()).json(); const response = await put({ ...await input(), ...patch }); expect(response.status).toBe(400); expect((await response.json()).error.fields).toBeTruthy(); expect(await (await get()).json()).toEqual(before); expect(purgeSpy).not.toHaveBeenCalled(); expect(await db.query.siteState.findFirst()).toBeUndefined(); });
 it("partial PUT is rejected", async () => { expect((await put({ name: "Partial" })).status).toBe(400); });
 it("PUT replacing cvKey leaves the old file in place", async () => {
  const old = await saveFile(new Uint8Array([37, 80, 68, 70]), "pdf", "application/pdf"); const next = await saveFile(new Uint8Array([37, 80, 68, 70, 1]), "pdf", "application/pdf"); await db.update(profile).set({ cvKey: old.key }); expect((await put({ ...await input(), cvKey: next.key })).status).toBe(200); expect(blobStore.has(old.key)).toBe(true); expect(blobStore.has(next.key)).toBe(true); expect((await (await get()).json()).cvKey).toBe(next.key);
 });
 it("PUT keeping cvKey deletes nothing", async () => { const file = await saveFile(new Uint8Array([37, 80, 68, 70]), "pdf", "application/pdf"); await db.update(profile).set({ cvKey: file.key }); const keys = [...blobStore.keys()]; expect((await put(await input())).status).toBe(200); expect([...blobStore.keys()]).toEqual(keys); });
 it("clearing photoKey leaves the old file in place", async () => { const file = await saveFile(new Uint8Array([1]), "png", "image/png"); await db.update(profile).set({ photoKey: file.key }); expect((await put({ ...await input(), photoKey: null, photoAlt: null })).status).toBe(200); expect(blobStore.has(file.key)).toBe(true); });
 it("invalid PUT cannot delete the old CV", async () => { const file = await saveFile(new Uint8Array([1]), "pdf", "application/pdf"); await db.update(profile).set({ cvKey: file.key }); expect((await put({ ...await input(), cvKey: null, email: "bad" })).status).toBe(400); expect(blobStore.has(file.key)).toBe(true); });
 it("PUT inserts and then bumps lastSavedAt on conflict", async () => { await put(await input()); expect((await db.query.siteState.findFirst())?.lastSavedAt).toBeInstanceOf(Date); await db.update(siteState).set({ lastSavedAt: new Date("2000-01-01") }); await put(await input()); expect((await db.query.siteState.findFirst())!.lastSavedAt!.getTime()).toBeGreaterThan(new Date("2000-01-01").getTime()); });
 it("GET and PUT are 404 when no profile exists", async () => { const body = await input(); await db.delete(profile); expect((await get()).status).toBe(404); expect((await put(body)).status).toBe(404); });
 it("requires authentication and checks origin first on PUT", async () => { expect((await call(handler, { path: "/api/admin/profile" })).status).toBe(401); expect((await call(handler, { path: "/api/admin/profile", method: "PUT", origin: "https://foreign.test", json: {} })).status).toBe(403); });
});
