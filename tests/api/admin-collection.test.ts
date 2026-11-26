import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/client";
import { eq } from "drizzle-orm";
import { projects, siteState } from "../../db/schema";
import handler from "../../netlify/functions/admin-collection";
import projectHandler from "../../netlify/functions/project";
import { saveFile } from "../../server/blobs";
import { blobStore, call, loginCookie, purgeSpy, resetDb, seedMinimal } from "./helpers";
import { describeDb } from "./describe-db";

// OWED-DB: explicit opt-in as well as the existing isolated-database safety guard.
const inputs = {
  projects: { slug: "created", title: "Created", summary: "Summary", body: "", role: null, category: "Web", technologies: ["TS"], liveUrl: null, githubUrl: null, imageKey: null, imageAlt: null, featured: false, isVisible: true, sortOrder: 0 },
  experience: { position: "Created", company: null, location: null, startDate: "2020-01", endDate: null, current: true, bullets: ["One"], isVisible: true, sortOrder: 0 },
  education: { degree: "Created", school: "School", location: null, startDate: "2020-01", endDate: "2024-01", description: null, isVisible: true, sortOrder: 0 },
  skills: { name: "Created", category: "Language", iconSlug: null, isVisible: true, sortOrder: 0 },
} as const;
type Name = keyof typeof inputs;
describeDb("OWED-DB admin collections (real DB)", () => {
  let cookie: string;
  const savedAt = new Date("2000-01-01");
  beforeEach(async () => { await resetDb(); await seedMinimal(); cookie = await loginCookie(); await db.insert(siteState).values({ lastSavedAt: savedAt }); });
  const run = (path: string, method = "GET", json?: unknown) => call(handler, { path, method, cookie, json });
  const lastSaved = async () => (await db.query.siteState.findFirst())!.lastSavedAt!.getTime();
  const rows = async (name: Name) => await (await run(`/api/admin/${name}`)).json() as Array<{ id: number; sortOrder: number }>;
  for (const name of Object.keys(inputs) as Name[]) describe(name, () => {
    it("list includes hidden rows ordered by sortOrder then id", async () => {
      const list = await rows(name); expect(list.length).toBeGreaterThan(1);
      expect(list.some(row => (row as unknown as { isVisible: boolean }).isVisible === false)).toBe(true);
      const sorted = [...list].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id); expect(list).toEqual(sorted);
    });
    it("create returns 201, appends sortOrder, bumps lastSavedAt and purges content", async () => {
      const max = Math.max(...(await rows(name)).map(row => row.sortOrder)); purgeSpy.mockClear();
      const response = await run(`/api/admin/${name}`, "POST", { ...inputs[name], sortOrder: 0 }); expect(response.status).toBe(201);
      expect((await response.json()).sortOrder).toBe(max + 1); expect(await lastSaved()).toBeGreaterThan(savedAt.getTime()); expect(purgeSpy).toHaveBeenCalled();
    });
    it("update replaces every field; missing id is 404", async () => {
      const [first] = await rows(name); const response = await run(`/api/admin/${name}/${first.id}`, "PUT", { ...inputs[name], sortOrder: 5 });
      expect(response.status).toBe(200); expect(await response.json()).toEqual({ ...inputs[name], sortOrder: 5, id: first.id });
      expect((await run(`/api/admin/${name}/99999`, "PUT", inputs[name])).status).toBe(404);
    });
    it("delete is 204 and the row is gone; missing id is 404", async () => {
      const [first] = await rows(name); expect((await run(`/api/admin/${name}/${first.id}`, "DELETE")).status).toBe(204);
      expect((await rows(name)).some(row => row.id === first.id)).toBe(false); expect((await run(`/api/admin/${name}/${first.id}`, "DELETE")).status).toBe(404);
    });
    it("invalid body is 400 with fields and writes nothing", async () => {
      const before = await rows(name); const response = await run(`/api/admin/${name}`, "POST", { sortOrder: 0 });
      expect(response.status).toBe(400); expect((await response.json()).error.fields).toBeTruthy(); expect(await rows(name)).toEqual(before); expect(await lastSaved()).toBe(savedAt.getTime());
    });
    it("reorder saves the new order and bumps lastSavedAt", async () => {
      const ids = (await rows(name)).map(row => row.id).reverse(); expect((await run(`/api/admin/${name}/order`, "PUT", { ids })).status).toBe(204);
      expect((await rows(name)).map(row => row.id)).toEqual(ids); expect(await lastSaved()).toBeGreaterThan(savedAt.getTime());
    });
    it("reorder with an unknown or duplicate id is 400 and changes nothing", async () => {
      const before = await rows(name); const [a] = before;
      for (const ids of [[a.id, 99999], [a.id, a.id]]) { const response = await run(`/api/admin/${name}/order`, "PUT", { ids }); expect(response.status).toBe(400); expect((await response.json()).error.fields.ids).toBeTruthy(); }
      expect(await rows(name)).toEqual(before); expect(await lastSaved()).toBe(savedAt.getTime());
    });
    it("\"order\" is not an id and a non-numeric id is 404", async () => {
      expect((await run(`/api/admin/${name}/order`, "DELETE")).status).toBe(404); expect((await run(`/api/admin/${name}/abc`, "PUT", inputs[name])).status).toBe(404);
    });
    it("requires authentication and checks origin first on writes", async () => {
      expect((await call(handler, { path: `/api/admin/${name}` })).status).toBe(401);
      expect((await call(handler, { path: `/api/admin/${name}`, method: "POST", origin: "https://foreign.test", json: {} })).status).toBe(403);
    });
  });
  it("unknown collection is 404", async () => { expect((await run("/api/admin/widgets")).status).toBe(404); });
  it("experience validation reports bullets.2", async () => { const response = await run("/api/admin/experience", "POST", { ...inputs.experience, bullets: ["a", "b", ""] }); expect((await response.json()).error.fields["bullets.2"]).toBeTruthy(); });
  it("non-project writes purge the plain content tag", async () => { await run("/api/admin/skills", "POST", inputs.skills); expect(purgeSpy).toHaveBeenCalledWith({ tags: ["content"] }); });
  it("project writes purge project:<old> and project:<new>", async () => {
    const [target] = await db.select().from(projects).where(eq(projects.slug, "regular")); purgeSpy.mockClear();
    expect((await run(`/api/admin/projects/${target.id}`, "PUT", { ...inputs.projects, slug: "renamed" })).status).toBe(200);
    const tags = purgeSpy.mock.calls.flatMap(call => call[0].tags); expect(tags).toEqual(expect.arrayContaining(["project:regular", "project:renamed"]));
  });
  it("duplicate slug on create is 409 with fields.slug and no timestamp bump", async () => {
    const response = await run("/api/admin/projects", "POST", { ...inputs.projects, slug: "regular" }); expect(response.status).toBe(409);
    const body = await response.json(); expect(body.error.code).toBe("conflict"); expect(body.error.fields.slug).toBeTruthy(); expect(await lastSaved()).toBe(savedAt.getTime());
  });
  it("renaming to an existing slug is 409", async () => {
    const [target] = await db.select().from(projects).where(eq(projects.slug, "regular")); const response = await run(`/api/admin/projects/${target.id}`, "PUT", { ...inputs.projects, slug: "featured" });
    expect(response.status).toBe(409); expect((await response.json()).error.fields.slug).toBeTruthy();
  });
  it("renamed project: old slug is 404 on the public route, new slug 200", async () => {
    const [target] = await db.select().from(projects).where(eq(projects.slug, "regular")); await run(`/api/admin/projects/${target.id}`, "PUT", { ...inputs.projects, slug: "renamed" });
    expect((await call(projectHandler, { path: "/api/projects/regular" })).status).toBe(404); expect((await call(projectHandler, { path: "/api/projects/renamed" })).status).toBe(200);
  });
  it("deleting a project leaves its image file", async () => {
    const file = await saveFile(new Uint8Array([1]), "png", "image/png"); const [target] = await db.select().from(projects).where(eq(projects.slug, "regular"));
    await db.update(projects).set({ imageKey: file.key, imageAlt: "Alt" }).where(eq(projects.id, target.id));
    expect((await run(`/api/admin/projects/${target.id}`, "DELETE")).status).toBe(204); expect(blobStore.has(file.key)).toBe(true);
  });
  it("changing imageKey leaves the old file", async () => {
    const old = await saveFile(new Uint8Array([1]), "png", "image/png"); const next = await saveFile(new Uint8Array([2]), "png", "image/png"); const [target] = await db.select().from(projects).where(eq(projects.slug, "regular"));
    await db.update(projects).set({ imageKey: old.key, imageAlt: "Alt" }).where(eq(projects.id, target.id));
    expect((await run(`/api/admin/projects/${target.id}`, "PUT", { ...inputs.projects, slug: "regular", imageKey: next.key, imageAlt: "Alt" })).status).toBe(200);
    expect(blobStore.has(old.key)).toBe(true); expect(blobStore.has(next.key)).toBe(true);
  });
});
