import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/client";
import { education, experience, messages, profile, projects, siteState } from "../../db/schema";
import handler from "../../netlify/functions/admin-summary";
import { call, loginCookie, resetDb, seedMinimal } from "./helpers";
import type { AdminSummary } from "../../shared/index";
import { describeDb } from "./describe-db";

// OWED-DB: explicit opt-in, never inferred from the presence of credentials.
describeDb("OWED-DB admin summary (real DB)", () => {
 let cookie: string;
 beforeEach(async () => { await resetDb(); await seedMinimal(); cookie = await loginCookie(); });
 const get = () => call(handler, { path: "/api/admin/summary", cookie });
 const data = async (): Promise<AdminSummary> => (await get()).json();
 it("counts all content including hidden rows, but only non-archived messages", async () => {
  await db.insert(messages).values([
   { name: "Unread", email: "p@example.com", message: "Hello" },
   { name: "Read", email: "p@example.com", message: "Hello", isRead: true },
   { name: "Archived", email: "p@example.com", message: "Hello", archivedAt: new Date() },
  ]); const body = await data(); expect(body.counts).toEqual({ projects: 3, experience: 3, education: 2, skills: 2, messages: 2 }); expect(body.unreadCount).toBe(1); expect(body.recentMessages.map(row => row.name)).toEqual(["Unread"]); expect(body.recentMessages[0]).not.toHaveProperty("ipHash"); expect(body.lastSavedAt).toBeNull();
 });
 it("toFillIn lists missing cv and only visible missing fields", async () => {
  await db.update(profile).set({ cvKey: null, photoKey: null, location: null, available: true, availabilityText: null }); const body = await data(); expect(body.toFillIn).toEqual(expect.arrayContaining([
   { section: "profile", id: null, field: "cvKey", label: "CV" }, { section: "profile", id: null, field: "photoKey", label: "Photo" }, { section: "profile", id: null, field: "location", label: "Location" }, { section: "profile", id: null, field: "availabilityText", label: "Availability text" },
  ])); const hiddenProject = await db.query.projects.findFirst({ where: (table, { eq }) => eq(table.isVisible, false) }); const hiddenRole = await db.query.experience.findFirst({ where: (table, { eq }) => eq(table.isVisible, false) }); expect(body.toFillIn.some(item => item.section === "projects" && item.id === hiddenProject?.id)).toBe(false); expect(body.toFillIn.some(item => item.section === "experience" && item.id === hiddenRole?.id)).toBe(false);
 });
 it("newest three unread use timestamp then descending id; read and archived excluded", async () => {
  const rows = await db.insert(messages).values([
   { name: "One", email: "p@example.com", message: "One", createdAt: new Date("2026-01-01") },
   { name: "Two", email: "p@example.com", message: "Two", createdAt: new Date("2026-02-01") },
   { name: "Three", email: "p@example.com", message: "Three", createdAt: new Date("2026-02-01") },
   { name: "Four", email: "p@example.com", message: "Four", createdAt: new Date("2026-03-01") },
   { name: "Read", email: "p@example.com", message: "Read", isRead: true, createdAt: new Date("2026-04-01") },
   { name: "Archived", email: "p@example.com", message: "Archived", archivedAt: new Date(), createdAt: new Date("2026-05-01") },
  ]).returning(); const body = await data(); expect(body.unreadCount).toBe(4); expect(body.recentMessages.map(row => row.id)).toEqual([rows[3].id, rows[2].id, rows[1].id]);
 });
 it("fallback selects newest three non-archived when all active messages are read", async () => {
  const rows = await db.insert(messages).values([1, 2, 3, 4].map(n => ({ name: `Read ${n}`, email: "p@example.com", message: "Read", isRead: true, createdAt: new Date("2026-01-01") }))).returning(); await db.insert(messages).values({ name: "Archived unread", email: "p@example.com", message: "Hidden", archivedAt: new Date() }); const body = await data(); expect(body.unreadCount).toBe(0); expect(body.recentMessages.map(row => row.id)).toEqual([rows[3].id, rows[2].id, rows[1].id]);
 });
 it("does not pad a single unread with newer read messages", async () => { await db.insert(messages).values([{ name: "Unread", email: "p@example.com", message: "One", createdAt: new Date("2020-01-01") }, { name: "Read", email: "p@example.com", message: "Two", isRead: true }]); expect((await data()).recentMessages.map(row => row.name)).toEqual(["Unread"]); });
 it("reports lastSavedAt as an ISO timestamp", async () => { await db.insert(siteState).values({ lastSavedAt: new Date("2026-01-01") }); expect((await data()).lastSavedAt).toBe("2026-01-01T00:00:00.000Z"); });
 it("handles missing profile and empty collections without 500", async () => { await db.delete(profile); await db.delete(projects); await db.delete(experience); await db.delete(education); const body = await data(); expect(body.toFillIn).toContainEqual({ section: "profile", id: null, field: "cvKey", label: "CV" }); expect(body.recentMessages).toEqual([]); expect(body.counts.projects).toBe(0); });
 it("requires authentication", async () => { expect((await call(handler, { path: "/api/admin/summary" })).status).toBe(401); });
});
