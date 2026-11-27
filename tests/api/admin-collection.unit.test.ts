import type { Context } from "@netlify/functions";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
const m = vi.hoisted(() => ({ select: vi.fn(), from: vi.fn(), where: vi.fn(), order: vi.fn(), insert: vi.fn(), values: vi.fn(), update: vi.fn(), set: vi.fn(), remove: vi.fn(), returning: vi.fn(), touch: vi.fn(), purge: vi.fn(), blob: vi.fn(), auth: vi.fn(), profile: vi.fn(), images: vi.fn() }));
vi.mock("../../db/client", () => ({ db: { select: m.select, insert: m.insert, update: m.update, delete: m.remove, query: { profile: { findFirst: m.profile }, projects: { findMany: m.images } } } }));
vi.mock("../../server/last-saved", () => ({ touchLastSaved: m.touch }));
vi.mock("../../server/cache", () => ({ purgeContent: m.purge }));
vi.mock("../../server/blobs", () => ({ deleteFile: m.blob }));
vi.mock("../../server/sessions", () => ({ requireAdmin: m.auth }));
import handler, { config } from "../../netlify/functions/admin-collection";
import { fail } from "../../server/http";
import { projectToRow, experienceToRow, educationToRow, skillToRow } from "../../server/mappers";
import { projects, experience, education, skills } from "../../db/schema";
const imageKey = "a".repeat(32) + ".png";
const fixtures = {
 projects: { slug: "old", title: "Title", summary: "Summary", body: "Body", role: null, category: "Web", technologies: ["TS"], liveUrl: null, githubUrl: null, imageKey, imageAlt: "Image", featured: false, isVisible: false, sortOrder: 7 },
 experience: { position: "Engineer", company: null, location: null, startDate: "2020-01", endDate: null, current: true, bullets: ["One"], isVisible: false, sortOrder: 7 },
 education: { degree: "Degree", school: "School", location: null, startDate: "2020-01", endDate: "2024-01", description: null, isVisible: false, sortOrder: 7 },
 skills: { name: "TS", category: "Language", iconSlug: null, iconSvg: null, isVisible: false, sortOrder: 7 },
} as const;
const cases = [
 { name: "projects", table: projects, input: fixtures.projects, row: projectToRow({ ...fixtures.projects, technologies: ["TS"] }) },
 { name: "experience", table: experience, input: fixtures.experience, row: experienceToRow({ ...fixtures.experience, bullets: ["One"] }) },
 { name: "education", table: education, input: fixtures.education, row: educationToRow(fixtures.education) },
 { name: "skills", table: skills, input: fixtures.skills, row: skillToRow(fixtures.skills) },
];
function req(method = "GET", path = "/api/admin/projects", body?: unknown, origin = "https://site.test") {
 return new Request("https://site.test" + path, { method, headers: { Origin: origin }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
const ctx = {} as Context;

it.each(["POST", "PUT"])("%s maps wrapped unique violation to 409 fields.slug without cleanup or purge", async method => {
 vi.spyOn(console, "error").mockImplementation(() => {});
 m.where.mockResolvedValue([{ ...cases[0].row, id: 2 }]);
 const error = new Error("private", { cause: Object.assign(new Error("secret"), { code: "23505" }) });
 if (method === "POST") m.returning.mockRejectedValueOnce(error); else m.touch.mockRejectedValueOnce(error);
 const response = await handler(req(method, "/api/admin/projects" + (method === "PUT" ? "/2" : ""), fixtures.projects), ctx);
 expect(response.status).toBe(409); const body = await response.json(); expect(body.error.code).toBe("conflict"); expect(body.error.fields.slug).toBeTruthy();
 expect(JSON.stringify(body)).not.toMatch(/private|secret/); expect(m.blob).not.toHaveBeenCalled(); expect(m.purge).not.toHaveBeenCalled();
});
it("maps a direct unique violation too", async () => {
 vi.spyOn(console, "error").mockImplementation(() => {}); m.returning.mockRejectedValueOnce({ code: "23505" });
 expect((await handler(req("POST", "/api/admin/projects", fixtures.projects), ctx)).status).toBe(409);
});
it("POST rejects an invalid sortOrder like any other field", async () => {
 const response = await handler(req("POST", "/api/admin/skills", { ...fixtures.skills, sortOrder: -1 }), ctx);
 expect(response.status).toBe(400); expect((await response.json()).error.fields.sortOrder).toBeTruthy(); expect(m.values).not.toHaveBeenCalled();
});
it("deleting a project leaves its image file", async () => {
 m.where.mockResolvedValue([{ ...cases[0].row, id: 2 }]);
 expect((await handler(req("DELETE", "/api/admin/projects/2"), ctx)).status).toBe(204);
 expect(m.blob).not.toHaveBeenCalled(); expect(m.images).not.toHaveBeenCalled(); expect(m.profile).not.toHaveBeenCalled(); expect(m.purge).toHaveBeenCalledWith({ slugs: ["old"] });
});
it("changing imageKey leaves the old file", async () => {
 m.where.mockResolvedValue([{ ...cases[0].row, id: 2 }]);
 const response = await handler(req("PUT", "/api/admin/projects/2", { ...fixtures.projects, slug: "new", imageKey: "b".repeat(32) + ".png" }), ctx);
 expect(response.status).toBe(200); expect(m.blob).not.toHaveBeenCalled(); expect(m.images).not.toHaveBeenCalled();
 expect(m.purge).toHaveBeenCalledWith({ slugs: ["old", "new"] });
});
it.each([["GET", "/api/admin/projects/order"], ["PUT", "/api/admin/projects/0"], ["PUT", "/api/admin/projects/abc"], ["DELETE", "/api/admin/skills/1.5"], ["DELETE", "/api/admin/skills/99999999999"], ["GET", "/api/admin/widgets"], ["PUT", "/api/admin/widgets/order"], ["POST", "/api/admin/skills/order"], ["GET", "/api/admin/skills/3"]])("%s %s is 404 without queries", async (method, path) => {
 const response = await handler(req(method, path, method === "GET" || method === "DELETE" ? undefined : fixtures.skills), ctx);
 expect(response.status).toBe(404); expect(m.select).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled(); expect(m.remove).not.toHaveBeenCalled(); expect(m.touch).not.toHaveBeenCalled();
});
it("PUT /order is the reorder route, not id 'order'", async () => {
 m.where.mockResolvedValue([{ ...cases[3].row, id: 1 }]); expect((await handler(req("PUT", "/api/admin/skills/order", { ids: [1] }), ctx)).status).toBe(204);
});
it("experience validation reports bullets index path", async () => {
 const response = await handler(req("POST", "/api/admin/experience", { ...fixtures.experience, bullets: ["a", "b", ""] }), ctx);
 expect(response.status).toBe(400); expect((await response.json()).error.fields["bullets.2"]).toBeTruthy(); expect(m.values).not.toHaveBeenCalled();
});
it("write requests check origin before auth", async () => {
 expect((await handler(req("DELETE", "/api/admin/skills/1", undefined, "https://foreign.test"), ctx)).status).toBe(403); expect(m.auth).not.toHaveBeenCalled();
});
it("reorder with an unknown or duplicate id reports fields.ids", async () => {
 m.where.mockResolvedValue([{ ...cases[3].row, id: 1 }]);
 for (const ids of [[1, 99], [1, 1]]) { const body = await (await handler(req("PUT", "/api/admin/skills/order", { ids }), ctx)).json(); expect(body.error.code).toBe("validation"); expect(body.error.fields.ids).toBeTruthy(); }
});

beforeEach(() => {
 vi.clearAllMocks(); vi.stubEnv("SITE_ORIGIN", "https://site.test");
 m.auth.mockReset().mockResolvedValue({ renewedCookie: "session=renewed" });
 m.select.mockReturnValue({ from: m.from });
 m.from.mockReturnValue({ where: m.where, orderBy: m.order });
 m.order.mockReset().mockResolvedValue([]);
 m.where.mockReset().mockReturnValue({ returning: m.returning, then: (resolve: (x: unknown) => void) => resolve([]) });
 m.insert.mockReturnValue({ values: m.values }); m.values.mockReturnValue({ returning: m.returning });
 m.update.mockReturnValue({ set: m.set }); m.set.mockReturnValue({ where: m.where }); m.remove.mockReturnValue({ where: m.where });
 m.returning.mockReset().mockResolvedValue([]); m.touch.mockReset().mockResolvedValue(undefined);
 m.profile.mockReset().mockResolvedValue({ photoKey: null, cvKey: null }); m.images.mockReset().mockResolvedValue([]);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
it("registers only the twelve explicit collection paths", () => {
 expect(config.path).toEqual(cases.flatMap(c => [`/api/admin/${c.name}`, `/api/admin/${c.name}/order`, `/api/admin/${c.name}/:id`]));
});
for (const c of cases) describe(c.name, () => {
 it("POST appends max+1, ignores sent order, touches and purges", async () => {
  m.order.mockResolvedValue([{ ...c.row, id: 1 }, { ...c.row, id: 2, sortOrder: 20 }]);
  m.returning.mockResolvedValue([{ ...c.row, sortOrder: 21, id: 3 }]);
  const response = await handler(req("POST", `/api/admin/${c.name}`, { ...c.input, sortOrder: 999 }), ctx);
  expect(response.status).toBe(201); expect(await response.json()).toEqual({ ...c.input, sortOrder: 21, id: 3 });
  expect(m.values).toHaveBeenCalledWith({ ...c.row, sortOrder: 21 }); expect(m.touch).toHaveBeenCalledOnce();
  if (c.name === "projects") expect(m.purge).toHaveBeenCalledWith({ slugs: ["old"] });
  else expect(m.purge).toHaveBeenCalledExactlyOnceWith();
 });
 it("PUT/order batches index updates, touches once and purges", async () => {
  m.where.mockResolvedValue([{ ...c.row, id: 1 }, { ...c.row, id: 2 }]);
  const response = await handler(req("PUT", `/api/admin/${c.name}/order`, { ids: [2, 1] }), ctx);
  expect(response.status).toBe(204); expect(m.set.mock.calls).toEqual([[{ sortOrder: 0 }], [{ sortOrder: 1 }]]);
  expect(m.touch).toHaveBeenCalledWith([expect.anything(), expect.anything()]);
  if (c.name === "projects") expect(m.purge).toHaveBeenCalledWith({ slugs: ["old", "old"] });
  else expect(m.purge).toHaveBeenCalledExactlyOnceWith();
 });
 it.each([{ ids: [1, 99] }, { ids: [1, 1] }, { ids: [] }, {}, { ids: [0] }, { ids: ["1"] }])("rejects unknown, duplicate or invalid reorder ids without updates: %j", async body => {
  m.where.mockResolvedValue([{ ...c.row, id: 1 }]);
  const response = await handler(req("PUT", `/api/admin/${c.name}/order`, body), ctx);
  expect(response.status).toBe(400); expect(Object.keys((await response.json()).error.fields).some(key => key === "ids" || key.startsWith("ids."))).toBe(true);
  expect(m.update).not.toHaveBeenCalled(); expect(m.touch).not.toHaveBeenCalled(); expect(m.purge).not.toHaveBeenCalled();
 });
 it("DELETE persists removal, touches and purges", async () => {
  m.where.mockResolvedValue([{ ...c.row, id: 2 }]);
  const response = await handler(req("DELETE", `/api/admin/${c.name}/2`), ctx);
  expect(response.status).toBe(204); expect(await response.text()).toBe("");
  expect(m.remove).toHaveBeenCalledWith(c.table); expect(m.touch).toHaveBeenCalledOnce();
  if (c.name === "projects") expect(m.purge).toHaveBeenCalledWith({ slugs: ["old"] });
  else expect(m.purge).toHaveBeenCalledExactlyOnceWith();
  expect(m.blob).not.toHaveBeenCalled();
 });
 it("PUT fully replaces fields and maps dates, touches and purges", async () => {
  m.where.mockResolvedValue([{ ...c.row, id: 2 }]);
  const replacement = { ...c.input, isVisible: true, sortOrder: 4 };
  const response = await handler(req("PUT", `/api/admin/${c.name}/2`, replacement), ctx);
  expect(response.status).toBe(200); expect(await response.json()).toEqual({ ...replacement, id: 2 });
  expect(m.set).toHaveBeenCalledWith({ ...c.row, isVisible: true, sortOrder: 4 });
  expect(m.touch).toHaveBeenCalledOnce();
  if (c.name === "projects") expect(m.purge).toHaveBeenCalledWith({ slugs: ["old", "old"] });
  else expect(m.purge).toHaveBeenCalledExactlyOnceWith();
  expect(m.blob).not.toHaveBeenCalled();
 });
 it.each(["PUT", "DELETE"])("%s missing id is 404 without writes", async method => {
  m.where.mockResolvedValue([]);
  const response = await handler(req(method, `/api/admin/${c.name}/2`, method === "PUT" ? c.input : undefined), ctx);
  expect(response.status).toBe(404); expect(m.update).not.toHaveBeenCalled(); expect(m.remove).not.toHaveBeenCalled(); expect(m.touch).not.toHaveBeenCalled();
 });
 it("rejects incomplete or invalid replacement before writes", async () => {
  const response = await handler(req("PUT", `/api/admin/${c.name}/2`, { sortOrder: -1 }), ctx);
  expect(response.status).toBe(400); expect((await response.json()).error.fields.sortOrder).toBeTruthy();
  expect(m.update).not.toHaveBeenCalled(); expect(m.touch).not.toHaveBeenCalled();
 });
 it("GET includes hidden rows and orders by sortOrder then id", async () => {
  m.order.mockResolvedValue([{ ...c.row, id: 2 }, { ...c.row, id: 3 }]);
  const res = await handler(req("GET", `/api/admin/${c.name}`), ctx);
  expect(res.status).toBe(200); expect(await res.json()).toEqual([{ ...c.input, id: 2 }, { ...c.input, id: 3 }]);
  expect(m.from).toHaveBeenCalledWith(c.table);
  const sql = m.order.mock.calls[0].map((x: Parameters<PgDialect["sqlToQuery"]>[0]) => new PgDialect().sqlToQuery(x).sql);
  expect(sql).toEqual([`"${c.name}"."sort_order" asc`, `"${c.name}"."id" asc`]);
  expect(m.touch).not.toHaveBeenCalled(); expect(res.headers.get("Set-Cookie")).toBe("session=renewed");
 });
});
it("accepts a maximum-length multibyte project body (> 64 KiB) on POST", async () => {
 const u = "https://example.com/" + "a".repeat(2000);
 const full = { ...fixtures.projects, slug: "a".repeat(80), title: "€".repeat(100), summary: "€".repeat(200), body: "€".repeat(20000), role: "€".repeat(200), category: "€".repeat(50), technologies: Array(20).fill("€".repeat(40)), liveUrl: u, githubUrl: u, imageKey: null, imageAlt: "€".repeat(200) };
 const raw = JSON.stringify(full); expect(new TextEncoder().encode(raw).byteLength).toBeGreaterThan(65536);
 m.where.mockResolvedValue([]); m.returning.mockResolvedValueOnce([{ ...projectToRow(full), sortOrder: 0, id: 3 }]);
 const response = await handler(new Request("https://site.test/api/admin/projects", { method: "POST", headers: { Origin: "https://site.test" }, body: raw }), ctx);
 expect(response.status).toBe(201);
 expect(await response.json()).toEqual({ ...full, sortOrder: 0, id: 3 });
 expect(m.values).toHaveBeenCalledExactlyOnceWith({ ...projectToRow(full), sortOrder: 0 });
});
it("skill icons round-trip through POST, PUT and GET", async () => {
 const iconSvg='<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>';
 const input={...fixtures.skills,iconSvg};
 const row={...skillToRow(input),id:9};
 m.returning.mockResolvedValueOnce([row]);
 const created=await handler(req('POST','/api/admin/skills',input),ctx);
 expect(created.status).toBe(201); expect((await created.json()).iconSvg).toBe(iconSvg);
 m.where.mockResolvedValueOnce([row]);
 const updated=await handler(req('PUT','/api/admin/skills/9',input),ctx);
 expect((await updated.json()).iconSvg).toBe(iconSvg);
 m.order.mockResolvedValueOnce([row]);
 expect((await (await handler(req('GET','/api/admin/skills'),ctx)).json())[0].iconSvg).toBe(iconSvg);
});
it("POST above the cap returns 413", async () => {
 const response = await handler(req("POST", "/api/admin/projects", { ...fixtures.projects, body: "x".repeat(140000) }), ctx);
 expect(response.status).toBe(413);
});
