import type { Context } from "@netlify/functions";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ get: vi.fn(), projects: vi.fn(), update: vi.fn(), set: vi.fn(), where: vi.fn(), touch: vi.fn(), purge: vi.fn(), remove: vi.fn(), auth: vi.fn() }));
vi.mock("../../db/client", () => ({ db: { query: { profile: { findFirst: mocks.get }, projects: { findMany: mocks.projects } }, update: mocks.update } }));
vi.mock("../../server/last-saved", () => ({ touchLastSaved: mocks.touch }));
vi.mock("../../server/blobs", () => ({ deleteFile: mocks.remove }));
vi.mock("../../server/cache", () => ({ purgeContent: mocks.purge }));
vi.mock("../../server/sessions", () => ({ requireAdmin: mocks.auth }));
import handler, { config } from "../../netlify/functions/admin-profile";
import { fail } from "../../server/http";
const key = (char: string, ext = "pdf") => char.repeat(32) + "." + ext;
const input = { name: "Person", headline: "Engineer", intro: "Hi", about: "", location: null, email: "person@example.com", githubUrl: null, linkedinUrl: null, available: false, availabilityText: null, cvKey: key("a"), photoKey: key("b", "png"), photoAlt: "Portrait" };
const old = { ...input, id: 1, updatedAt: new Date("2020-01-01") };
const ctx = {} as Context;
function req(method = "GET", body?: unknown, path = "/api/admin/profile", origin = "https://site.test") {
 return new Request("https://site.test" + path, { method, headers: { Origin: origin }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("SITE_ORIGIN", "https://site.test"); mocks.auth.mockResolvedValue({ renewedCookie: "renewed=1" }); mocks.get.mockReset().mockImplementation(async () => ({ ...old, ...mocks.set.mock.lastCall?.[0] })); mocks.projects.mockResolvedValue([]); mocks.update.mockReturnValue({ set: mocks.set }); mocks.set.mockReturnValue({ where: mocks.where }); mocks.where.mockReturnValue({ write: true }); mocks.touch.mockResolvedValue(undefined); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
it("GET returns the admin Profile without the database id and renews the cookie", async () => {
 expect(config.path).toBe("/api/admin/profile"); const response = await handler(req(), ctx);
 expect(await response.json()).toEqual({ ...input, updatedAt: old.updatedAt.toISOString() }); expect(response.headers.get("Set-Cookie")).toBe("renewed=1");
});
it("PUT saves a full Profile, updates updatedAt, touches last saved and purges", async () => {
 const response = await handler(req("PUT", { ...input, name: "Updated" }), ctx);
 expect(response.status).toBe(200); const result = await response.json(); expect(result.name).toBe("Updated"); expect(new Date(result.updatedAt).getTime()).toBeGreaterThan(old.updatedAt.getTime());
 expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ name: "Updated", updatedAt: expect.any(Date) })); expect(mocks.touch).toHaveBeenCalledWith({ write: true }); expect(mocks.purge).toHaveBeenCalledExactlyOnceWith(); expect(mocks.remove).not.toHaveBeenCalled();
});
it.each([{ name: "" }, { email: "bad" }, { photoAlt: null }, { cvKey: "bad" }, { available: "yes" }, { headline: "x".repeat(81) }])("PUT rejects invalid input with fields: %j", async patch => {
 const response = await handler(req("PUT", { ...input, ...patch }), ctx); expect(response.status).toBe(400); expect((await response.json()).error.fields).toBeTruthy(); expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.touch).not.toHaveBeenCalled(); expect(mocks.remove).not.toHaveBeenCalled();
});
it("PUT rejects a partial replacement", async () => { expect((await handler(req("PUT", { name: "Only" }), ctx)).status).toBe(400); expect(mocks.touch).not.toHaveBeenCalled(); });
it("profile save never deletes the old cv or photo file", async () => {
 const response = await handler(req("PUT", { ...input, cvKey: key("c"), photoKey: null, photoAlt: null }), ctx);
 expect(response.status).toBe(200); expect(mocks.remove).not.toHaveBeenCalled(); expect(mocks.projects).not.toHaveBeenCalled(); expect(mocks.purge).toHaveBeenCalledOnce();
});
it("two overlapping saves never delete the current key's file", async () => {
 let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
 mocks.touch.mockImplementationOnce(async () => { await gate; });
 const a = handler(req("PUT", { ...input, cvKey: null }), ctx); const b = await handler(req("PUT", { ...input, name: "Other" }), ctx);
 release(); const first = await a;
 expect(first.status).toBe(200); expect(b.status).toBe(200); expect(mocks.set.mock.lastCall?.[0].cvKey).toBe(input.cvKey); expect(mocks.remove).not.toHaveBeenCalled();
});
it("failed persistence never deletes old files or purges", async () => {
 vi.spyOn(console, "error").mockImplementation(() => {}); mocks.touch.mockRejectedValueOnce(new Error("internal")); const response = await handler(req("PUT", { ...input, cvKey: key("c") }), ctx); expect(response.status).toBe(500); expect(await response.text()).not.toContain("internal"); expect(mocks.remove).not.toHaveBeenCalled(); expect(mocks.purge).not.toHaveBeenCalled();
});
it("missing profile is 404 on both methods", async () => { mocks.get.mockResolvedValue(null); expect((await handler(req(), ctx)).status).toBe(404); expect((await handler(req("PUT", input), ctx)).status).toBe(404); });
it("origin is checked before authentication and body parsing", async () => { const request = req("PUT", {}, undefined, "https://foreign.test"); const parse = vi.spyOn(request, "json"); expect((await handler(request, ctx)).status).toBe(403); expect(mocks.auth).not.toHaveBeenCalled(); expect(parse).not.toHaveBeenCalled(); });
it.each(["GET", "PUT"])("%s requires admin before query work", async method => { mocks.auth.mockRejectedValueOnce(fail("unauthorized", "Sign in.")); expect((await handler(req(method, method === "PUT" ? input : undefined), ctx)).status).toBe(401); expect(mocks.get).not.toHaveBeenCalled(); });
it.each(["POST", "PATCH", "DELETE", "HEAD", "OPTIONS"])("%s is 404", async method => { expect((await handler(req(method), ctx)).status).toBe(404); expect(mocks.get).not.toHaveBeenCalled(); });
it("wrong path is 404", async () => { expect((await handler(req("GET", undefined, "/api/admin/profile/extra"), ctx)).status).toBe(404); });
