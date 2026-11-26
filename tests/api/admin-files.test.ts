import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/client";
import handler from "../../netlify/functions/admin-files";
import { blobStore, call, loginCookie, purgeSpy, resetDb, seedMinimal } from "./helpers";
import { describeDb } from "./describe-db";

const PDF = new Uint8Array([...Buffer.from("%PDF-1.7\n"), 1, 2, 3]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const form = (data: Uint8Array<ArrayBuffer>, name: string) => { const f = new FormData(); f.append("file", new File([data], name)); return f; };

// OWED-DB: explicit opt-in as well as the existing isolated-database safety guard.
describeDb("OWED-DB admin file upload (real DB)", () => {
  let cookie: string;
  beforeEach(async () => { await resetDb(); await seedMinimal(); cookie = await loginCookie(); });
  const upload = (kind: string, data: FormData) => call(handler, { path: `/api/admin/files?kind=${kind}`, method: "POST", cookie, form: data });

  it("upload does not change the profile or projects", async () => {
    const profileBefore = await db.query.profile.findFirst();
    const projectsBefore = await db.query.projects.findMany();
    const cv = await upload("cv", form(PDF, "cv.pdf"));
    const image = await upload("image", form(PNG, "photo.png"));
    expect(cv.status).toBe(201); expect(image.status).toBe(201);
    const cvKey = (await cv.json()).key; const imageKey = (await image.json()).key;
    expect(blobStore.has(cvKey)).toBe(true); expect(blobStore.has(imageKey)).toBe(true);
    expect(await db.query.profile.findFirst()).toEqual(profileBefore);
    expect(await db.query.projects.findMany()).toEqual(projectsBefore);
    expect(await db.query.siteState.findFirst()).toBeUndefined();
    expect(purgeSpy).not.toHaveBeenCalled();
  });

  it("needs a session and a same-origin request", async () => {
    expect((await call(handler, { path: "/api/admin/files?kind=cv", method: "POST", form: form(PDF, "cv.pdf") })).status).toBe(401);
    expect((await call(handler, { path: "/api/admin/files?kind=cv", method: "POST", cookie, origin: "https://foreign.test", form: form(PDF, "cv.pdf") })).status).toBe(403);
    expect(blobStore.size).toBe(0);
  });
});
