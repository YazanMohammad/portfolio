import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import { PREVIEW_FILES, seedEducation, seedExperience, seedProfile, seedProjects, seedSkills } from "../../db/seed-data";
import { defaultUploadFile } from "../../db/seed";
import { PROFILE_ABOUT, PROFILE_INTRO, siteCopy } from "../../src/content/copy";
import fallback from "../../src/content/fallback.json";
import cv from "./cv-content.fixture.json";
import { EducationInput, ExperienceInput, ProfileInput, ProjectInput, SkillInput } from "../../shared/index";

const all = () => JSON.stringify([seedProfile, seedExperience, seedEducation, seedProjects, seedSkills, fallback, siteCopy]);
describe("CV seed content (user ruling)", () => {
  it("keeps all three CV roles in order, with exact approved bullets", () => {
    expect(seedExperience.map(e => [e.position, e.company, e.bullets])).toEqual(cv.experience.map(e => [e.title, e.org, e.bullets]));
    expect(seedExperience.map(e => [e.startDate,e.endDate,e.current,e.location])).toEqual([
      ["2026-08",null,true,null], ["2025-12","2026-04",false,null], ["2024-09","2025-01",false,"Jordan"],
    ]);
  });
  it("uses the CV projects, technologies, summaries and approved links", () => {
    expect(seedProjects.map(p => [p.title,p.summary,p.technologies])).toEqual(cv.projects.map(p => [p.name,["Built an ad-free Android music player with background playback, a queue, on-device discovery, Jamendo API search and synced lyrics; covered with unit and widget tests.","Built an Arabic (RTL) app that calculates four types of zakat, checks nisab against live gold and silver prices from a Next.js API route, and exports PDF reports.","Built a responsive chat app with authentication, private messaging, input validation, unread indicators and SignalR updates; used Codex and Claude coding agents during development."][cv.projects.indexOf(p)],p.tech.split(", ")]));
    expect(seedProjects.map(p => [p.slug,p.category,p.liveUrl,p.githubUrl])).toEqual([
      ["spitfire","Mobile",null,"https://github.com/YazanMohammad/Spitfire"],
      ["zakat-calculator","Web","https://zaka.yznmoh.com","https://github.com/YazanMohammad/zaka"],
      ["chat-app","Full Stack","https://chat.yznmoh.com","https://github.com/YazanMohammad/ChatApp"],
    ]);
    expect(PREVIEW_FILES).toEqual({"chat-app":"public/preview-chat.png"});
    for (const path of Object.values(PREVIEW_FILES)) expect(existsSync(path)).toBe(true);
  });
  it("copies every CV skill group and item in order", () => {
    expect(seedSkills.map(s => [s.category,s.name])).toEqual(cv.skills.flatMap(g => g.items.map(name => [g.label,name])));
    for (const s of seedSkills) if(s.iconSlug) expect(existsSync(`public/icons/${s.iconSlug}.svg`)).toBe(true);
    expect(seedSkills.filter(s => s.iconSlug).map(s => [s.name,s.iconSlug])).toEqual([
      ["Python","python"],["C#","csharp"],["JavaScript","javascript"],["TypeScript","typescript"],["Java","java"],["ASP.NET Core","dotnet"],["React.js","react"],["Git","git"],
    ]);
  });
  it("uses approved contact and education without GPA or phone", () => {
    expect(seedProfile).toMatchObject({headline:"AI Engineer",email:"yazan.b.n@gmail.com",linkedinUrl:"https://www.linkedin.com/in/yznmoh/",githubUrl:"https://github.com/YazanMohammad",photoKey:null});
    expect(seedEducation).toEqual([{degree:"B.S. in Computer Science",school:"Zarqa University",location:"Zarqa, Jordan",startDate:"2021-09",endDate:"2024-06",description:null,isVisible:true,sortOrder:1}]);
    expect(all()).not.toMatch(/GPA|300\+ hours|\+?962[\s-]*78[\s-]*1[\s-]*174[\s-]*866|tel:/i);
  });
  it("uses shared first-person copy and valid shared schemas", () => {
    expect(seedProfile.intro).toBe(PROFILE_INTRO); expect(seedProfile.about).toBe(PROFILE_ABOUT);
    expect(ProfileInput.safeParse(seedProfile).success).toBe(true);
    for(const row of seedExperience) expect(ExperienceInput.safeParse(row).success).toBe(true);
    for(const row of seedEducation) expect(EducationInput.safeParse(row).success).toBe(true);
    for(const row of seedProjects) expect(ProjectInput.safeParse(row).success).toBe(true);
    for(const row of seedSkills) expect(SkillInput.safeParse(row).success).toBe(true);
    expect(JSON.stringify([seedProfile,seedExperience,seedProjects,seedSkills])).not.toMatch(/[^\x00-\x7F]/);
  });
  it("matches every snapshot content field to its seed counterpart", () => {
    const {photoKey,cvKey,...profile} = seedProfile;
    expect(fallback.profile).toMatchObject(profile);
    for(const [rows,seeds] of [[fallback.projects,seedProjects],[fallback.experience,seedExperience],[fallback.education,seedEducation],[fallback.skills,seedSkills]] as const) {
      expect(rows).toHaveLength(seeds.length);
      seeds.forEach((seed,index) => { const {isVisible,...fields}=seed; const {body,...card}=fields as typeof fields & {body?:string}; expect(rows[index]).toMatchObject(card); });
    }
  });
});
describe("default uploader", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("fails clearly without Blobs configuration", async () => {
    vi.stubEnv("BLOBS_SITE_ID", ""); vi.stubEnv("BLOBS_TOKEN", ""); vi.stubEnv("NETLIFY", undefined);
    const error = await defaultUploadFile(new Uint8Array([1]), "png", "image/png").catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error); expect((error as Error).message).toContain("BLOBS_SITE_ID"); expect((error as Error).message).not.toContain("\n");
  });
});
