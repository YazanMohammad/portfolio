import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import {
  CV_SOURCE_URL, PREVIEW_FILES, seedEducation, seedExperience, seedProfile, seedProjects, seedSkills,
} from "../../db/seed-data";
import { defaultUploadFile } from "../../db/seed";
import { PROFILE_ABOUT, PROFILE_INTRO } from "../../src/content/copy";
import {
  EducationInput, ExperienceInput, ProfileInput, ProjectInput, SkillInput,
} from "../../shared/index";

const all = () => JSON.stringify([seedProfile, seedExperience, seedEducation, seedProjects, seedSkills]);

describe("seed data (no database)", () => {
  it("has the contract counts and slugs", () => {
    expect([seedExperience.length, seedEducation.length, seedProjects.length, seedSkills.length]).toEqual([2, 1, 3, 14]);
    expect(seedProjects.map((p) => p.slug)).toEqual(["portfolio-v1", "chat-app", "tic-tac-toe"]);
    expect(Object.keys(PREVIEW_FILES).sort()).toEqual(["chat-app", "portfolio-v1", "tic-tac-toe"]);
    expect(CV_SOURCE_URL).toMatch(/^https:\/\/.*cv\.pdf$/);
  });
  it("uses the site copy for intro and about", () => {
    expect(seedProfile.intro).toBe(PROFILE_INTRO);
    expect(seedProfile.about).toBe(PROFILE_ABOUT);
  });
  it("passes the shared input schemas", () => {
    expect(ProfileInput.safeParse(seedProfile).success).toBe(true);
    for (const row of seedExperience) expect(ExperienceInput.safeParse(row).success).toBe(true);
    for (const row of seedEducation) expect(EducationInput.safeParse(row).success).toBe(true);
    for (const row of seedSkills) expect(SkillInput.safeParse(row).success).toBe(true);
    // Projects get their image key and alt from the upload step.
    for (const row of seedProjects) expect(ProjectInput.safeParse(row).success).toBe(true);
  });
  it("keeps the AI Engineer role free of employer and dates", () => {
    const role = seedExperience.find((row) => row.position === "AI Engineer")!;
    expect(role).toMatchObject({ company: null, startDate: null, endDate: null, current: true });
    expect(seedProfile.photoKey).toBeNull();
  });
  it("has no years-of-experience or metric claims", () => {
    const text = all();
    expect(text).not.toMatch(/\d\s*\+?\s*years?/i);
    expect(text).not.toMatch(/years? of experience/i);
    const withPercent = text.match(/[^"]*%[^"]*/g) ?? [];
    expect(withPercent).toEqual(["GPA 76.1%"]);
  });
  it("is English only", () => {
    expect(all()).not.toMatch(/[^\x00-\x7F]/);
  });
  it("maps icon slugs only to icons that exist, C and SQL to null", () => {
    for (const skill of seedSkills) {
      if (skill.iconSlug) expect(existsSync(`public/icons/${skill.iconSlug}.svg`)).toBe(true);
    }
    const byName = Object.fromEntries(seedSkills.map((s) => [s.name, s.iconSlug]));
    expect(byName.C).toBeNull();
    expect(byName.SQL).toBeNull();
    expect(byName["C#"]).toBe("csharp");
  });
  it("points preview files at images in public/", () => {
    for (const file of Object.values(PREVIEW_FILES)) expect(existsSync(file)).toBe(true);
  });
});

describe("default uploader", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("fails with one clear line when Blobs are not configured outside Netlify", async () => {
    vi.stubEnv("BLOBS_SITE_ID", "");
    vi.stubEnv("BLOBS_TOKEN", "");
    vi.stubEnv("NETLIFY", undefined);
    const error = await defaultUploadFile(new Uint8Array([1]), "png", "image/png").catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("BLOBS_SITE_ID");
    expect((error as Error).message).not.toContain("\n");
  });
});

describe("seed copy (user approved texts)", () => {
  const intern = () => seedExperience.find((row) => row.position === "Software Engineering Intern")!;
  const fallback = async () => (await import("../../src/content/fallback.json")).default as any;
  it("uses the plain intern bullets and project copy", () => {
    expect(intern().bullets).toContain("Worked on the backend and made slow database queries faster.");
    expect(intern().bullets).toContain("Worked with the team on UI changes.");
    expect(intern().company).toBe("Xocialive");
    const chat = seedProjects.find((p) => p.slug === "chat-app")!;
    const ttt = seedProjects.find((p) => p.slug === "tic-tac-toe")!;
    expect(chat.summary).toBe("A real-time chat app. React frontend, ASP.NET Core backend, SignalR for live messages.");
    expect(ttt.summary).toBe("A Tic-Tac-Toe game in React. It detects wins and draws and works on phones.");
    expect(ttt.technologies).toEqual(["React.JS"]);
  });
  it("fallback.json carries the same copy", async () => {
    const fb = await fallback();
    const text = JSON.stringify(fb);
    for (const old of ["Assisted in backend", "Collaborated with a team", "Full-stack real-time", "interactive Tic-Tac-Toe", "State Management"]) {
      expect(text).not.toContain(old);
    }
    const ttt = fb.projects.find((p: any) => p.slug === "tic-tac-toe");
    expect(ttt.summary).toBe(seedProjects.find((p) => p.slug === "tic-tac-toe")!.summary);
    expect(ttt.technologies).toEqual(["React.JS"]);
    expect(fb.projects.find((p: any) => p.slug === "chat-app").summary)
      .toBe(seedProjects.find((p) => p.slug === "chat-app")!.summary);
    const bullets = fb.experience.find((e: any) => e.position === "Software Engineering Intern").bullets;
    expect(bullets).toEqual(intern().bullets);
  });
});
