import { beforeEach, expect, it, vi } from "vitest";
import { count, eq } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { db } from "../../db/client";
import {
  adminSessions, education, experience, loginAttempts, messages, profile, projects, siteState, skills,
} from "../../db/schema";
import { runSeed } from "../../db/seed";
import { CV_SOURCE_URL, seedEducation, seedExperience, seedProfile, seedProjects, seedSkills } from "../../db/seed-data";
import content from "../../netlify/functions/content";
import { toEducation, toExperience, educationToRow, experienceToRow, profileToRow, projectToRow, skillToRow } from "../../server/mappers";
import { touchLastSaved } from "../../server/last-saved";
import { createSession } from "../../server/sessions";
import {
  EducationInput, ExperienceInput, ProfileInput, ProjectInput, SkillInput, type PublicContent,
} from "../../shared/index";
import { call, resetDb } from "./helpers";
import { describeDb } from "./describe-db";

const PDF = new TextEncoder().encode("%PDF-1.4\n%fake cv");
const okCv = vi.fn(async () => new Response(PDF, { status: 200 }));
let counter = 0;
const uploadFile = vi.fn(async (bytes: Uint8Array, ext: string, contentType: string) => {
  const key = `${(++counter).toString(16).padStart(32, "0")}.${ext}`;
  return { key, url: `/api/files/${key}`, contentType, size: bytes.byteLength };
});
const rows = async (table: PgTable) => (await db.select({ n: count() }).from(table))[0].n;
const seedOptions = { fetchCv: okCv as unknown as typeof fetch, uploadFile };

describeDb("seed script (real db)", () => {
  beforeEach(async () => {
    await resetDb();
    counter = 0;
    uploadFile.mockClear();
    okCv.mockClear();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("seeds the content in contract §8", async () => {
    expect(await runSeed({ force: false, ...seedOptions })).toEqual({ skipped: false });
    expect([await rows(profile), await rows(experience), await rows(education), await rows(projects), await rows(skills)])
      .toEqual([1, 2, 1, 3, 14]);
    const exp = await db.select().from(experience);
    const ai = exp.find((r) => r.position === "AI Engineer")!;
    expect(ai).toMatchObject({ company: null, startDate: null, endDate: null, current: true });
    const intern = exp.find((r) => r.position === "Software Engineering Intern")!;
    expect(intern).toMatchObject({ startDate: "2024-09-01", endDate: "2025-01-01", current: false });
    expect(intern.bullets).toHaveLength(3);
    const [edu] = await db.select().from(education);
    expect(edu).toMatchObject({ startDate: "2021-01-01", endDate: "2024-01-01", description: "GPA 76.1%" });
    const slugs = (await db.select().from(projects)).map((r) => r.slug).sort();
    expect(slugs).toEqual(["chat-app", "portfolio-v1", "tic-tac-toe"]);
    const [p] = await db.select().from(profile);
    expect(p).toMatchObject({ photoKey: null, name: "Yazan Mohammad", headline: "AI Engineer" });
    expect(p.cvKey).toMatch(/\.pdf$/);
    const skillRows = await db.select().from(skills);
    expect(skillRows.find((s) => s.name === "C")!.iconSlug).toBeNull();
    expect(skillRows.find((s) => s.name === "SQL")!.iconSlug).toBeNull();
  });

  it("second run without --force skips and changes nothing", async () => {
    await runSeed({ force: false, ...seedOptions });
    const before = JSON.stringify([await db.select().from(profile), await db.select().from(projects)]);
    uploadFile.mockClear();
    expect(await runSeed({ force: false, ...seedOptions })).toEqual({ skipped: true });
    expect(uploadFile).not.toHaveBeenCalled();
    expect(JSON.stringify([await db.select().from(profile), await db.select().from(projects)])).toBe(before);
  });

  it("--force replaces content but keeps messages, sessions and login attempts", async () => {
    await runSeed({ force: false, ...seedOptions });
    await db.update(profile).set({ name: "Changed" });
    await db.delete(skills).where(eq(skills.name, "Git"));
    await db.update(projects).set({ title: "Changed" });
    await db.update(experience).set({ position: "Changed" });
    await db.update(education).set({ degree: "Changed" });
    await touchLastSaved();
    expect(await rows(siteState)).toBe(1);
    await db.insert(messages).values({ name: "A", email: "a@example.com", message: "hi" });
    await db.insert(loginAttempts).values({ ipHash: "h", success: false });
    await createSession();
    await runSeed({ force: true, ...seedOptions });
    expect((await db.select().from(profile))[0].name).toBe("Yazan Mohammad");
    expect([await rows(experience), await rows(education), await rows(projects), await rows(skills)]).toEqual([2, 1, 3, 14]);
    expect(await rows(messages)).toBe(1);
    expect(await rows(loginAttempts)).toBe(1);
    expect(await rows(adminSessions)).toBe(1);
    expect(await rows(siteState)).toBe(0);
    expect((await db.select().from(projects)).some((r) => r.title === "Changed")).toBe(false);
    expect((await db.select().from(experience)).some((r) => r.position === "Changed")).toBe(false);
    expect((await db.select().from(education)).some((r) => r.degree === "Changed")).toBe(false);
    expect((await db.select().from(messages))[0].message).toBe("hi");
  });

  it("a plain run refuses when any content table has a row and deletes nothing", async () => {
    const tables = [profile, projects, experience, education, skills, siteState];
    for (const table of tables) {
      await resetDb();
      if (table === profile) await db.insert(profile).values({ id: 1, ...profileToRow(ProfileInput.parse({ ...seedProfile, cvKey: null })) });
      else if (table === projects) await db.insert(projects).values(projectToRow(ProjectInput.parse({ ...seedProjects[0], imageKey: null, imageAlt: null })));
      else if (table === experience) await db.insert(experience).values(experienceToRow(ExperienceInput.parse(seedExperience[0])));
      else if (table === education) await db.insert(education).values(educationToRow(EducationInput.parse(seedEducation[0])));
      else if (table === skills) await db.insert(skills).values(skillToRow(SkillInput.parse(seedSkills[0])));
      else await touchLastSaved();
      const before = await Promise.all(tables.map(rows));
      uploadFile.mockClear();
      expect(await runSeed({ force: false, ...seedOptions })).toEqual({ skipped: true });
      expect(uploadFile).not.toHaveBeenCalled();
      expect(await Promise.all(tables.map(rows))).toEqual(before);
    }
  });

  it("unreachable CV leaves cvKey null and still seeds", async () => {
    const down = vi.fn(async () => { throw new Error("network down"); });
    expect(await runSeed({ force: false, ...seedOptions, fetchCv: down as unknown as typeof fetch })).toEqual({ skipped: false });
    expect((await db.select().from(profile))[0].cvKey).toBeNull();
    expect(await rows(projects)).toBe(3);
    expect(console.warn).toHaveBeenCalled();
  });

  it("non-PDF CV response is rejected", async () => {
    const html = vi.fn(async () => new Response("<html>not a pdf</html>", { status: 200 }));
    await runSeed({ force: false, ...seedOptions, fetchCv: html as unknown as typeof fetch });
    expect((await db.select().from(profile))[0].cvKey).toBeNull();
    expect(uploadFile.mock.calls.some(([, ext]) => ext === "pdf")).toBe(false);
    expect(html).toHaveBeenCalledWith(CV_SOURCE_URL, expect.anything());
  });

  it("project images are stored and keyed", async () => {
    await runSeed({ force: false, ...seedOptions });
    const imageCalls = uploadFile.mock.calls.filter(([, ext]) => ext === "png");
    expect(imageCalls).toHaveLength(3);
    for (const [bytes, , type] of imageCalls) {
      expect(bytes.byteLength).toBeGreaterThan(0);
      expect(type).toBe("image/png");
    }
    for (const row of await db.select().from(projects)) {
      expect(row.imageKey).toMatch(/^[a-f0-9]{32}\.png$/);
      expect(row.imageAlt).toBe(`Screenshot of ${row.title}`);
    }
  });

  it("without Blobs configured the default uploader fails and the seed still completes", async () => {
    vi.stubEnv("BLOBS_SITE_ID", "");
    vi.stubEnv("BLOBS_TOKEN", "");
    vi.stubEnv("NETLIFY", undefined);
    try {
      expect(await runSeed({ force: false, fetchCv: okCv as unknown as typeof fetch })).toEqual({ skipped: false });
    } finally {
      vi.unstubAllEnvs();
    }
    expect(await rows(projects)).toBe(3);
    for (const row of await db.select().from(projects)) {
      expect(row.imageKey).toBeNull();
      expect(row.imageAlt).toBeNull();
    }
    expect((await db.select().from(profile))[0].cvKey).toBeNull();
    const warned = (console.warn as unknown as ReturnType<typeof vi.fn>).mock.calls.flat().join("\n");
    expect(warned).toContain("BLOBS_SITE_ID");
    expect(warned.match(/Blobs are not configured/g)).toHaveLength(1);
  });

  it("seeded content passes the shared input schemas", async () => {
    await runSeed({ force: false, ...seedOptions });
    const [p] = await db.select().from(profile);
    expect(ProfileInput.safeParse(p).success).toBe(true);
    for (const row of await db.select().from(projects)) expect(ProjectInput.safeParse(row).success).toBe(true);
    for (const row of (await db.select().from(experience)).map(toExperience)) expect(ExperienceInput.safeParse(row).success).toBe(true);
    for (const row of (await db.select().from(education)).map(toEducation)) expect(EducationInput.safeParse(row).success).toBe(true);
    for (const row of await db.select().from(skills)) expect(SkillInput.safeParse(row).success).toBe(true);
  });

  it("the public content function returns the seeded profile and three projects", async () => {
    await runSeed({ force: false, ...seedOptions });
    const response = await call(content, { path: "/api/content" });
    expect(response.status).toBe(200);
    const data: PublicContent = await response.json();
    expect(data.profile.name).toBe("Yazan Mohammad");
    expect(data.profile.cvUrl).toBe("/cv");
    expect(data.projects.map((r) => r.slug).sort()).toEqual(["chat-app", "portfolio-v1", "tic-tac-toe"]);
    expect(data.experience).toHaveLength(2);
    expect(data.skills).toHaveLength(14);
  });
});
