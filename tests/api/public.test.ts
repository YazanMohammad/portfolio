import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/client";
import { profile } from "../../db/schema";
import content from "../../netlify/functions/content";
import project from "../../netlify/functions/project";
import files from "../../netlify/functions/files";
import cv from "../../netlify/functions/cv";
import notFound from "../../netlify/functions/api-not-found";
import { saveFile } from "../../server/index";
import type { PublicContent, PublicProject } from "../../shared/index";
import { call, CV_KEY, PHOTO_KEY, resetDb, seedMinimal } from "./helpers";
import { describeDb } from "./describe-db";

const getContent = () => call(content, { path: "/api/content" });
const body = async (): Promise<PublicContent> => (await getContent()).json();

describeDb("public read endpoints (real db)", () => {
  beforeEach(async () => { await resetDb(); await seedMinimal(); });

  it("content returns profile and visible rows only", async () => {
    const data = await body();
    expect(data.profile.name).toBe("Test Person");
    expect(data.projects.map((row) => row.slug)).toEqual(["featured", "regular"]);
    expect(data.experience.map((row) => row.position)).toEqual(["Current", "Past"]);
    expect(data.education.map((row) => row.degree)).toEqual(["Degree"]);
    expect(data.skills.map((row) => row.name)).toEqual(["TypeScript"]);
    expect(data.experience[0].startDate).toBe("2022-02");
    expect(data.education[0].startDate).toBe("2018-09");
    expect(data.profile.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    for (const row of [...data.projects, ...data.experience, ...data.education, ...data.skills]) {
      expect(row).not.toHaveProperty("isVisible");
    }
    expect(data.projects[0]).not.toHaveProperty("body");
  });
  it('content hides cvKey and sets cvUrl "/cv"', async () => {
    const data = await body();
    expect(data.profile).not.toHaveProperty("cvKey");
    expect(data.profile).not.toHaveProperty("photoKey");
    expect(data.profile.cvUrl).toBe("/cv");
    expect(data.profile.photoUrl).toBe(`/api/files/${PHOTO_KEY}`);
  });
  it("content has cache tag content and swr header", async () => {
    const response = await getContent();
    expect(response.headers.get("Netlify-Cache-Tag")).toBe("content");
    expect(response.headers.get("Netlify-CDN-Cache-Control")).toBe("public, max-age=60, stale-while-revalidate=300, durable");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=0, must-revalidate");
  });
  it("content sorts featured projects first and the current role first", async () => {
    const data = await body();
    expect(data.projects[0].slug).toBe("featured");
    expect(data.experience[0].position).toBe("Current");
  });
  it("hidden project is 404 and absent from content", async () => {
    expect((await call(project, { path: "/api/projects/hidden" })).status).toBe(404);
    expect((await body()).projects.some((row) => row.slug === "hidden")).toBe(false);
  });
  it("unknown slug is 404", async () => {
    const response = await call(project, { path: "/api/projects/unknown" });
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("not_found");
  });
  it("project response has public detail and tags content and project:<slug>", async () => {
    const response = await call(project, { path: "/api/projects/featured" });
    expect(response.status).toBe(200);
    expect(response.headers.get("Netlify-Cache-Tag")).toBe("content,project:featured");
    expect(response.headers.get("Netlify-CDN-Cache-Control")).toBe("public, max-age=60, stale-while-revalidate=300, durable");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=0, must-revalidate");
    const data: PublicProject = await response.json();
    expect(data.body).toBe("Project body");
    expect(data.imageUrl).toBe(`/api/files/${PHOTO_KEY}`);
    expect(data).not.toHaveProperty("isVisible");
  });
  it("files serves bytes with immutable cache and nosniff", async () => {
    const saved = await saveFile(new Uint8Array([1, 2, 3]), "png", "image/png");
    const response = await call(files, { path: saved.url });
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Content-Security-Policy")).toBe("sandbox; default-src 'none'");
  });
  it("files rejects ../ keys with 404", async () => {
    expect((await call(files, { path: "/api/files/..%2Fsecret" })).status).toBe(404);
  });
  it("files unknown key is 404", async () => {
    expect((await call(files, { path: `/api/files/${PHOTO_KEY}` })).status).toBe(404);
  });
  it("cv redirects to the file", async () => {
    const response = await call(cv, { path: "/cv" });
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(`/api/files/${CV_KEY}`);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("cv is 404 without a CV and content has null cvUrl", async () => {
    await db.update(profile).set({ cvKey: null, photoKey: null });
    expect((await call(cv, { path: "/cv" })).status).toBe(404);
    const data = await body();
    expect(data.profile.cvUrl).toBeNull();
    expect(data.profile.photoUrl).toBeNull();
  });
  it("missing profile is 404", async () => {
    await db.delete(profile);
    expect((await getContent()).status).toBe(404);
    expect((await call(cv, { path: "/cv" })).status).toBe(404);
  });
  it("POST /api/content is 404", async () => {
    expect((await call(content, { path: "/api/content", method: "POST" })).status).toBe(404);
  });
  it("api-not-found returns json 404", async () => {
    const response = await call(notFound, { path: "/api/missing" });
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("not_found");
  });
});
