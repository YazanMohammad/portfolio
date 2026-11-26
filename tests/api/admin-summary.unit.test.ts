import type { Context } from "@netlify/functions";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ profile: vi.fn(), projects: vi.fn(), experience: vi.fn(), education: vi.fn(), skills: vi.fn(), messages: vi.fn(), state: vi.fn(), auth: vi.fn() }));
vi.mock("../../db/client", () => ({ db: { query: { profile: { findFirst: mocks.profile }, projects: { findMany: mocks.projects }, experience: { findMany: mocks.experience }, education: { findMany: mocks.education }, skills: { findMany: mocks.skills }, messages: { findMany: mocks.messages }, siteState: { findFirst: mocks.state } } } }));
vi.mock("../../server/sessions", () => ({ requireAdmin: mocks.auth }));
import handler, { config } from "../../netlify/functions/admin-summary";
import { fail } from "../../server/http";
const ctx = {} as Context;
const req = (method = "GET", path = "/api/admin/summary", origin = "https://site.test") => new Request("https://site.test" + path, { method, headers: { Origin: origin } });
const message = (id: number, isRead = false, archivedAt: Date | null = null) => ({ id, name: "Person", email: "p@example.com", subject: null, message: "Text", isRead, archivedAt, createdAt: new Date("2026-01-01"), ipHash: "private" });
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("SITE_ORIGIN", "https://site.test"); mocks.auth.mockResolvedValue({ renewedCookie: "session=renewed" }); mocks.profile.mockResolvedValue(null); for (const fn of [mocks.projects, mocks.experience, mocks.education, mocks.skills, mocks.messages]) fn.mockResolvedValue([]); mocks.state.mockResolvedValue(null); });
afterEach(() => vi.unstubAllEnvs());
it("returns contract counts, missing CV and null lastSavedAt", async () => {
 mocks.projects.mockResolvedValue([{ id: 1, isVisible: false }, { id: 2, isVisible: false }]); mocks.skills.mockResolvedValue([{}]); mocks.messages.mockResolvedValue([message(1), message(2, true), message(3, false, new Date())]);
 const response = await handler(req(), ctx); const result = await response.json(); expect(config.path).toBe("/api/admin/summary"); expect(result.counts).toEqual({ projects: 2, experience: 0, education: 0, skills: 1, messages: 2 }); expect(result.unreadCount).toBe(1); expect(result.toFillIn).toContainEqual({ section: "profile", id: null, field: "cvKey", label: "CV" }); expect(result.lastSavedAt).toBeNull(); expect(response.headers.get("Set-Cookie")).toBe("session=renewed"); expect(result.recentMessages[0]).not.toHaveProperty("ipHash");
});
it("newest three unread use descending id as a deterministic tie-break, without filling read slots", async () => {
 mocks.messages.mockResolvedValue([message(1), message(2), message(3), message(4), message(99, true)]);
 const result = await (await handler(req(), ctx)).json(); expect(result.unreadCount).toBe(4); expect(result.recentMessages.map((row: { id: number }) => row.id)).toEqual([4, 3, 2]);
});
it("falls back to newest three non-archived only when no unread remain", async () => {
 mocks.messages.mockResolvedValue([message(1, true), message(3, true), { ...message(2, true), createdAt: new Date("2026-02-01") }, message(4, true), message(10, true, new Date())]);
 mocks.state.mockResolvedValue({ id: 1, lastSavedAt: new Date("2026-03-01") });
 const result = await (await handler(req(), ctx)).json(); expect(result.recentMessages.map((row: { id: number }) => row.id)).toEqual([2, 4, 3]); expect(result.lastSavedAt).toBe("2026-03-01T00:00:00.000Z");
});
it("does not fill unread results with read messages", async () => { mocks.messages.mockResolvedValue([message(1), message(2, true)]); const result = await (await handler(req(), ctx)).json(); expect(result.recentMessages).toHaveLength(1); });
it("requires authentication before query work", async () => { mocks.auth.mockRejectedValueOnce(fail("unauthorized", "Sign in.")); expect((await handler(req(), ctx)).status).toBe(401); expect(mocks.profile).not.toHaveBeenCalled(); });
it("rejects foreign writes before authentication", async () => { expect((await handler(req("POST", undefined, "https://foreign.test"), ctx)).status).toBe(403); expect(mocks.auth).not.toHaveBeenCalled(); });
it.each(["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"])("%s is 404 without queries", async method => { expect((await handler(req(method), ctx)).status).toBe(404); expect(mocks.profile).not.toHaveBeenCalled(); });
it("wrong path is 404", async () => { expect((await handler(req("GET", "/api/admin/summary/extra"), ctx)).status).toBe(404); });
