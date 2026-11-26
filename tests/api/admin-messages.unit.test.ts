import type { Context } from "@netlify/functions";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ list: vi.fn(), update: vi.fn(), remove: vi.fn(), set: vi.fn(), where: vi.fn(), returning: vi.fn(), auth: vi.fn(), purge: vi.fn(), touch: vi.fn() }));
vi.mock("../../db/client", () => ({ db: { query: { messages: { findMany: mocks.list } }, update: mocks.update, delete: mocks.remove } }));
vi.mock("../../server/sessions", () => ({ requireAdmin: mocks.auth }));
vi.mock("../../server/cache", () => ({ purgeContent: mocks.purge }));
vi.mock("../../server/last-saved", () => ({ touchLastSaved: mocks.touch }));
import handler, { config } from "../../netlify/functions/admin-messages";
import { fail } from "../../server/http";
const ctx = {} as Context;
const row = { id: 1, name: "Person", email: "p@example.com", subject: null, message: "Hello", isRead: false, archivedAt: null, createdAt: new Date("2026-01-01"), ipHash: "private" };
function req(method = "GET", suffix = "", body?: unknown, origin = "https://site.test") { return new Request("https://site.test/api/admin/messages" + suffix, { method, headers: { Origin: origin }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
const query = (sql: Parameters<PgDialect["sqlToQuery"]>[0]) => new PgDialect().sqlToQuery(sql);
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("SITE_ORIGIN", "https://site.test"); mocks.auth.mockResolvedValue({ renewedCookie: "renewed=1" }); mocks.list.mockResolvedValue([row]); mocks.update.mockReturnValue({ set: mocks.set }); mocks.set.mockReturnValue({ where: mocks.where }); mocks.remove.mockReturnValue({ where: mocks.where }); mocks.where.mockReturnValue({ returning: mocks.returning }); mocks.returning.mockImplementation(async () => [{ ...row, ...mocks.set.mock.lastCall?.[0] }]); });
afterEach(() => vi.unstubAllEnvs());
it.each(["", "?status=all", "?status=unread", "?status=archived"])("GET filters %s and orders newest first then id", async suffix => {
 const response = await handler(req("GET", suffix), ctx); expect(response.status).toBe(200); const result = await response.json(); expect(result[0]).not.toHaveProperty("ipHash"); expect(result[0].createdAt).toBe(row.createdAt.toISOString()); expect(response.headers.get("Set-Cookie")).toBe("renewed=1");
 const options = mocks.list.mock.calls[0][0]; const filter = query(options.where); expect(filter.sql).toContain(suffix.includes("archived") ? "is not null" : "is null"); if (suffix.includes("unread")) { expect(filter.sql).toContain("is_read"); expect(filter.params).toContain(false); } expect(options.orderBy.map((item: Parameters<typeof query>[0]) => query(item).sql)).toEqual(['"messages"."created_at" desc', '"messages"."id" desc']);
});
it("declares the exact collection and item paths", () => { expect(config.path).toEqual(["/api/admin/messages", "/api/admin/messages/:id"]); });
it.each(["?status=bad", "?status=", "?status=UNREAD", "?status=all&status=archived"])("invalid status %s is 400", async suffix => { expect((await handler(req("GET", suffix), ctx)).status).toBe(400); expect(mocks.list).not.toHaveBeenCalled(); });
it.each([{ isRead: true }, { isRead: false }, { archived: true }, { archived: false }, { isRead: true, archived: false }])("PATCH validates and persists only requested flags %j", async patch => {
 const response = await handler(req("PATCH", "/1", patch), ctx); expect(response.status).toBe(200); const values = mocks.set.mock.calls[0][0]; expect(values).toEqual({ ...(patch.isRead === undefined ? {} : { isRead: patch.isRead }), ...(patch.archived === undefined ? {} : { archivedAt: patch.archived ? expect.any(Date) : null }) }); expect(query(mocks.where.mock.calls[0][0]).params).toEqual([1]); expect(mocks.purge).not.toHaveBeenCalled(); expect(mocks.touch).not.toHaveBeenCalled(); expect(await response.json()).not.toHaveProperty("ipHash");
});
it.each([{}, { nope: true }, { isRead: "true" }, { archived: null }, [], null])("PATCH rejects %j with fields before writing", async patch => { const response = await handler(req("PATCH", "/1", patch), ctx); expect(response.status).toBe(400); expect((await response.json()).error.fields).toBeTruthy(); expect(mocks.update).not.toHaveBeenCalled(); });
it("malformed JSON is 400", async () => { const request = new Request("https://site.test/api/admin/messages/1", { method: "PATCH", headers: { Origin: "https://site.test" }, body: "{bad" }); expect((await handler(request, ctx)).status).toBe(400); });
it("DELETE returns 204 without cache purge or lastSaved mutation", async () => { const response = await handler(req("DELETE", "/1"), ctx); expect(response.status).toBe(204); expect(await response.text()).toBe(""); expect(mocks.remove).toHaveBeenCalledOnce(); expect(mocks.purge).not.toHaveBeenCalled(); expect(mocks.touch).not.toHaveBeenCalled(); });
it.each(["PATCH", "DELETE"])("%s unknown id is 404", async method => { mocks.returning.mockResolvedValueOnce([]); expect((await handler(req(method, "/99", method === "PATCH" ? { isRead: true } : undefined), ctx)).status).toBe(404); });
it.each(["/abc", "/0", "/-1", "/1.2", "/1e2", "/2147483648", "/9007199254740993", "/1/extra", "/%31"])("invalid id %s is 404 before writes", async suffix => { expect((await handler(req("PATCH", suffix, { isRead: true }), ctx)).status).toBe(404); expect(mocks.update).not.toHaveBeenCalled(); });
it.each([["POST", ""], ["PUT", "/1"], ["GET", "/1"], ["PATCH", ""], ["DELETE", ""], ["HEAD", ""], ["OPTIONS", ""]])("%s %s is 404", async (method, suffix) => { expect((await handler(req(method, suffix), ctx)).status).toBe(404); expect(mocks.list).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.remove).not.toHaveBeenCalled(); });
it.each(["GET", "PATCH", "DELETE"])("%s requires authentication", async method => { mocks.auth.mockRejectedValueOnce(fail("unauthorized", "Sign in.")); expect((await handler(req(method, method === "GET" ? "" : "/1", method === "PATCH" ? { isRead: true } : undefined), ctx)).status).toBe(401); expect(mocks.list).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled(); });
it("foreign PATCH is rejected before authentication and parsing", async () => { const request = req("PATCH", "/1", {}, "https://foreign.test"); const parse = vi.spyOn(request, "json"); expect((await handler(request, ctx)).status).toBe(403); expect(mocks.auth).not.toHaveBeenCalled(); expect(parse).not.toHaveBeenCalled(); });
