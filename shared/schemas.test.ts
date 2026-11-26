import { describe, expect, expectTypeOf, it } from "vitest";
import * as shared from "./index";
import type { ZodTypeAny } from "zod";
import { ProfileInput, ProjectInput, ExperienceInput, EducationInput, SkillInput, ReorderInput, MessageInput, MessagePatch, LoginInput, AdminUsername, AdminPassword, foldUsername } from "./schemas";
import { yearMonth, fileKey, slug, url } from "./primitives";

describe("shared contract exports", () => {
  it("uses the controller's four MiB upload limits", () => {
    expect(shared.IMAGE_MAX_BYTES).toBe(4 * 1024 * 1024);
    expect(shared.CV_MAX_BYTES).toBe(4 * 1024 * 1024);
  });
  it("exports the collection allowlist and complete error status table", () => {
    expect(shared.COLLECTIONS).toEqual(["projects", "experience", "education", "skills"]);
    expect(shared.ERROR_STATUS).toEqual({ validation: 400, unauthorized: 401, forbidden_origin: 403,
      not_found: 404, conflict: 409, too_large: 413, unsupported_type: 415, rate_limited: 429, server: 500 });
  });
  it("re-exports all schemas and primitives", () => {
    for (const name of ["ProfileInput", "ProjectInput", "ExperienceInput", "EducationInput", "SkillInput",
      "ReorderInput", "MessageInput", "MessagePatch", "LoginInput", "AdminUsername", "AdminPassword", "yearMonth", "fileKey", "slug", "url"] as const) {
      expect(shared[name].safeParse).toBeTypeOf("function");
    }
  });
  it("exports the exact JSON response and input types", () => {
    type ProfileShape = { name: string; headline: string; intro: string; about: string; location: string | null;
      email: string; githubUrl: string | null; linkedinUrl: string | null; available: boolean;
      availabilityText: string | null; photoKey: string | null; photoAlt: string | null; cvKey: string | null; updatedAt: string };
    type ProjectShape = { id: number; slug: string; title: string; summary: string; body: string; role: string | null;
      category: string; technologies: string[]; liveUrl: string | null; githubUrl: string | null;
      imageKey: string | null; imageAlt: string | null; featured: boolean; isVisible: boolean; sortOrder: number };
    type ExperienceShape = { id: number; position: string; company: string | null; location: string | null;
      startDate: string | null; endDate: string | null; current: boolean; bullets: string[]; isVisible: boolean; sortOrder: number };
    type EducationShape = { id: number; degree: string; school: string; location: string | null; startDate: string | null;
      endDate: string | null; description: string | null; isVisible: boolean; sortOrder: number };
    type SkillShape = { id: number; name: string; category: string; iconSlug: string | null; isVisible: boolean; sortOrder: number };
    type MessageShape = { id: number; name: string; email: string; subject: string | null; message: string;
      isRead: boolean; archivedAt: string | null; createdAt: string };
    type ErrorCodeShape = "validation" | "unauthorized" | "forbidden_origin" | "not_found" | "conflict" |
      "too_large" | "unsupported_type" | "rate_limited" | "server";
    type Flat<T> = { [K in keyof T]: T[K] };
    expectTypeOf<Flat<shared.Profile>>().toEqualTypeOf<ProfileShape>();
    expectTypeOf<Flat<shared.Project>>().toEqualTypeOf<ProjectShape>();
    expectTypeOf<Flat<shared.Experience>>().toEqualTypeOf<ExperienceShape>();
    expectTypeOf<Flat<shared.Education>>().toEqualTypeOf<EducationShape>();
    expectTypeOf<Flat<shared.Skill>>().toEqualTypeOf<SkillShape>();
    expectTypeOf<Flat<shared.Message>>().toEqualTypeOf<MessageShape>();
    expectTypeOf<shared.ProjectCard>().toEqualTypeOf<Omit<ProjectShape, "body" | "isVisible">>();
    expectTypeOf<shared.PublicProject>().toEqualTypeOf<Omit<ProjectShape, "isVisible"> & { imageUrl: string | null }>();
    expectTypeOf<shared.PublicContent>().toEqualTypeOf<{
      settings?: ReturnType<typeof import("./settings").mergeSettings>;
      profile: Omit<ProfileShape, "cvKey" | "photoKey"> & { photoUrl: string | null; cvUrl: "/cv" | null };
      projects: Omit<ProjectShape, "body" | "isVisible">[]; experience: Omit<ExperienceShape, "isVisible">[];
      education: Omit<EducationShape, "isVisible">[]; skills: Omit<SkillShape, "isVisible">[];
    }>();
    expectTypeOf<shared.FillInItem>().toEqualTypeOf<{ section: "profile" | "projects" | "experience" | "education"; id: number | null; field: string; label: string }>();
    expectTypeOf<Flat<Omit<shared.AdminSummary, "recentMessages"> & { recentMessages: Flat<shared.AdminSummary["recentMessages"][number]>[] }>>().toEqualTypeOf<{ unreadCount: number; recentMessages: MessageShape[];
      counts: { projects: number; experience: number; education: number; skills: number; messages: number };
      toFillIn: shared.FillInItem[]; lastSavedAt: string | null }>();
    expectTypeOf<shared.UploadResult>().toEqualTypeOf<{ key: string; url: string; contentType: string; size: number }>();
    expectTypeOf<shared.ApiError>().toEqualTypeOf<{ error: { code: ErrorCodeShape; message: string; fields?: Record<string, string> } }>();
    expectTypeOf<shared.ErrorCode>().toEqualTypeOf<ErrorCodeShape>();
    expectTypeOf<shared.YearMonth>().toEqualTypeOf<string>();
    expectTypeOf<shared.FileKey>().toEqualTypeOf<string>();
    expectTypeOf<shared.Collection>().toEqualTypeOf<"projects" | "experience" | "education" | "skills">();
    expectTypeOf<shared.ProfileInput>().toEqualTypeOf<Omit<ProfileShape, "updatedAt">>();
    expectTypeOf<shared.ProjectInput>().toEqualTypeOf<Omit<ProjectShape, "id">>();
    expectTypeOf<shared.ExperienceInput>().toEqualTypeOf<Omit<ExperienceShape, "id">>();
    expectTypeOf<shared.EducationInput>().toEqualTypeOf<Omit<EducationShape, "id">>();
    expectTypeOf<shared.SkillInput>().toEqualTypeOf<Omit<SkillShape, "id">>();
    expectTypeOf<shared.MessageInput>().toEqualTypeOf<{ name: string; email: string; subject?: string | null; message: string; website: "" }>();
    expectTypeOf<shared.MessagePatch>().toEqualTypeOf<{ isRead?: boolean; archived?: boolean }>();
    expectTypeOf<shared.ReorderInput>().toEqualTypeOf<{ ids: number[] }>();
    expectTypeOf<shared.LoginInput>().toEqualTypeOf<{ username: string; password: string }>();
  });
});

const imageKey = `${"a".repeat(32)}.jpg`;
const pdfKey = `${"b".repeat(32)}.pdf`;
const profile = {
  name: "Yazan Mohammad", headline: "AI Engineer", intro: "I build useful software.",
  about: "", location: "Jordan", email: "yazan.b.n@gmail.com",
  githubUrl: "https://github.com/YazanMohammad", linkedinUrl: null, available: true,
  availabilityText: null, photoKey: null, photoAlt: null, cvKey: null,
};

function rejectsAt(schema: ZodTypeAny, value: unknown, path: string) {
  const result = schema.safeParse(value);
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error.issues.map((issue: { path: (string | number)[] }) => issue.path.join("."))).toContain(path);
  }
}

const message = { name: "Visitor", email: "visitor@example.com", subject: null, message: "Hello", website: "" };

describe("messages, login and reorder", () => {
  it("accepts valid messages with an optional subject", () => {
    expect(MessageInput.parse(message)).toEqual(message);
    const { subject, ...withoutSubject } = message;
    void subject;
    expect(MessageInput.safeParse(withoutSubject).success).toBe(true);
    expect(MessageInput.parse({ ...message, subject: " " }).subject).toBeNull();
  });
  it("rejects non-empty honeypots, including whitespace", () => {
    for (const website of ["x", " ", null, undefined]) rejectsAt(MessageInput, { ...message, website }, "website");
  });
  it.each([["name", 100], ["subject", 150], ["message", 5000]] as const)("limits message %s", (field, max) => {
    expect(MessageInput.safeParse({ ...message, [field]: "x".repeat(max) }).success).toBe(true);
    rejectsAt(MessageInput, { ...message, [field]: "x".repeat(max + 1) }, field);
  });
  it("requires nonblank message content and a valid bounded email", () => {
    for (const field of ["name", "message", "email"]) rejectsAt(MessageInput, { ...message, [field]: " " }, field);
    rejectsAt(MessageInput, { ...message, email: "not an email" }, "email");
    rejectsAt(MessageInput, { ...message, email: `${"x".repeat(190)}@example.com` }, "email");
  });
  it("requires a meaningful message patch key", () => {
    expect(MessagePatch.safeParse({}).success).toBe(false);
    expect(MessagePatch.safeParse({ unknown: true }).success).toBe(false);
    expect(MessagePatch.safeParse({ isRead: undefined }).success).toBe(false);
    expect(MessagePatch.parse({ isRead: true })).toEqual({ isRead: true });
    expect(MessagePatch.parse({ archived: false })).toEqual({ archived: false });
    expect(MessagePatch.parse({ isRead: false, archived: true })).toEqual({ isRead: false, archived: true });
    rejectsAt(MessagePatch, { archived: "true" }, "archived");
  });
  it("limits passwords without changing their contents", () => {
    const login = (password: string) => ({ username: "admin", password });
    rejectsAt(LoginInput, login(""), "password");
    rejectsAt(LoginInput, login("x".repeat(201)), "password");
    expect(LoginInput.parse(login("x".repeat(200))).password).toHaveLength(200);
    expect(LoginInput.parse(login(" secret ")).password).toBe(" secret ");
  });
  it("requires a bounded login username", () => {
    rejectsAt(LoginInput, { username: "", password: "p" }, "username");
    rejectsAt(LoginInput, { username: "x".repeat(201), password: "p" }, "username");
    rejectsAt(LoginInput, { password: "p" }, "username");
  });
  it("admin username is NFKC-normalised, trimmed, and has no control characters", () => {
    expect(AdminUsername.parse(" ＡＤＭＩＮ ")).toBe("ADMIN");
    expect(AdminUsername.parse("Ade\u0301le")).toBe("Ad\u00e9le");
    expect(AdminUsername.safeParse("adm\u0000in").success).toBe(false);
    expect(AdminUsername.safeParse("adm\u200bin").success).toBe(false);
    expect(foldUsername("ＡＤＭＩＮ")).toBe(foldUsername("admin"));
    expect(foldUsername("STRASSE")).toBe(foldUsername("straße"));
    expect(foldUsername(" Ade\u0301le ")).toBe(foldUsername("AD\u00c9LE"));
    expect(foldUsername("admin")).not.toBe(foldUsername("admín"));
  });
  it("admin username is trimmed and 3-64 characters", () => {
    expect(AdminUsername.parse("  Yazan ")).toBe("Yazan");
    for (const bad of ["", "ab", "  ab  ", "x".repeat(65)]) expect(AdminUsername.safeParse(bad).success, bad).toBe(false);
    expect(AdminUsername.parse("abc")).toBe("abc");
    expect(AdminUsername.parse("x".repeat(64))).toHaveLength(64);
  });
  it("admin password needs at least 12 characters and is kept as typed", () => {
    expect(AdminPassword.safeParse("x".repeat(11)).success).toBe(false);
    expect(AdminPassword.safeParse("x".repeat(201)).success).toBe(false);
    expect(AdminPassword.parse(" twelve chars")).toBe(" twelve chars");
  });
  it("requires non-empty unique bounded positive integer reorder IDs", () => {
    for (const ids of [[], [1, 1], Array.from({ length: 201 }, (_, i) => i + 1)]) rejectsAt(ReorderInput, { ids }, "ids");
    for (const ids of [[0], [-1], [1.5], ["1"]]) rejectsAt(ReorderInput, { ids }, "ids.0");
    expect(ReorderInput.parse({ ids: [3, 1, 2] })).toEqual({ ids: [3, 1, 2] });
    expect(ReorderInput.safeParse({ ids: Array.from({ length: 200 }, (_, i) => i + 1) }).success).toBe(true);
  });
});

const experience = {
  position: "AI Engineer", company: null, location: null, startDate: null, endDate: null,
  current: true, bullets: [], isVisible: true, sortOrder: 0,
};
const education = {
  degree: "B.S. in Computer Science", school: "Zarqa University", location: "Zarqa, Jordan",
  startDate: "2021-09", endDate: "2024-06", description: null, isVisible: true, sortOrder: 0,
};
const skill = { name: "Python", category: "Languages", iconSlug: "python", isVisible: true, sortOrder: 0 };

describe("dated entries and skills", () => {
  it("accepts complete entries", () => {
    expect(ExperienceInput.parse(experience)).toEqual(experience);
    expect(EducationInput.parse(education)).toEqual(education);
    expect(SkillInput.parse(skill)).toEqual(skill);
  });
  it("forces null endDate for current experience", () => {
    rejectsAt(ExperienceInput, { ...experience, endDate: "2025-01" }, "endDate");
    expect(ExperienceInput.parse({ ...experience, endDate: "" }).endDate).toBeNull();
  });
  it.each([ExperienceInput, EducationInput])("checks date order on the endDate path", (schema) => {
    const base = schema === ExperienceInput ? { ...experience, current: false } : education;
    rejectsAt(schema, { ...base, startDate: "2025-02", endDate: "2025-01" }, "endDate");
    expect(schema.safeParse({ ...base, startDate: "2025-01", endDate: "2025-01" }).success).toBe(true);
    expect(schema.safeParse({ ...base, startDate: null, endDate: null }).success).toBe(true);
    rejectsAt(schema, { ...base, startDate: "2025-13" }, "startDate");
  });
  it("limits experience fields and bullets", () => {
    for (const field of ["position", "company", "location"]) rejectsAt(ExperienceInput, { ...experience, [field]: "x".repeat(101) }, field);
    expect(ExperienceInput.safeParse({ ...experience, bullets: Array(10).fill("x".repeat(300)) }).success).toBe(true);
    rejectsAt(ExperienceInput, { ...experience, bullets: Array(11).fill("x") }, "bullets");
    rejectsAt(ExperienceInput, { ...experience, bullets: ["x".repeat(301)] }, "bullets.0");
    rejectsAt(ExperienceInput, { ...experience, bullets: [" "] }, "bullets.0");
  });
  it("limits education fields", () => {
    for (const field of ["degree", "school"]) {
      rejectsAt(EducationInput, { ...education, [field]: "x".repeat(101) }, field);
      rejectsAt(EducationInput, { ...education, [field]: "" }, field);
    }
    expect(EducationInput.safeParse({ ...education, description: "x".repeat(1000) }).success).toBe(true);
    rejectsAt(EducationInput, { ...education, description: "x".repeat(1001) }, "description");
  });
  it("limits skill fields", () => {
    for (const field of ["name", "category", "iconSlug"]) {
      expect(SkillInput.safeParse({ ...skill, [field]: "x".repeat(50) }).success).toBe(true);
      rejectsAt(SkillInput, { ...skill, [field]: "x".repeat(51) }, field);
    }
    rejectsAt(SkillInput, { ...skill, name: "" }, "name");
    rejectsAt(SkillInput, { ...skill, category: "" }, "category");
    expect(SkillInput.parse({ ...skill, iconSlug: " " }).iconSlug).toBeNull();
  });
});

describe("primitives", () => {
  it("uses exact year-month format", () => {
    for (const value of ["2025-01", "2025-12", "0000-01"]) expect(yearMonth.safeParse(value).success).toBe(true);
    for (const value of ["2025-00", "2025-13", "2025-1", "25-01", "2025-01-01", "x2025-01"]) expect(yearMonth.safeParse(value).success).toBe(false);
  });
  it("accepts only random lowercase file keys with supported extensions", () => {
    for (const ext of ["jpg", "png", "webp", "pdf"]) expect(fileKey.safeParse(`${"a".repeat(32)}.${ext}`).success).toBe(true);
    for (const value of ["../x.jpg", `${"A".repeat(32)}.jpg`, `${"a".repeat(31)}.jpg`, `${"a".repeat(32)}.svg`, `${"a".repeat(32)}.jpeg`]) expect(fileKey.safeParse(value).success).toBe(false);
  });
  it("exports URL and slug primitives", () => {
    expect(url.parse(" https://example.com ")).toBe("https://example.com");
    expect(slug.parse("my-project")).toBe("my-project");
  });
});

const project = {
  slug: "my-project", title: "My project", summary: "A useful app", body: "", role: null,
  category: "Web", technologies: ["TypeScript"], liveUrl: null, githubUrl: null,
  imageKey: null, imageAlt: null, featured: false, isVisible: true, sortOrder: 0,
};

it("sortOrder must be a non-negative integer", () => {
  for (const [schema, input] of [[ProjectInput, project], [ExperienceInput, experience],
    [EducationInput, education], [SkillInput, skill]] as const) {
    rejectsAt(schema, { ...input, sortOrder: 1.5 }, "sortOrder");
    rejectsAt(schema, { ...input, sortOrder: -1 }, "sortOrder");
    expect(schema.safeParse({ ...input, sortOrder: 3 }).success).toBe(true);
    expect(schema.safeParse({ ...input, sortOrder: 0 }).success).toBe(true);
  }
});

describe("project", () => {
  it("accepts a complete project", () => expect(ProjectInput.parse(project)).toEqual(project));
  it("validates the slug", () => {
    for (const slug of ["My Project", "x".repeat(81), "-x", "x-", "x--y", ""]) rejectsAt(ProjectInput, { ...project, slug }, "slug");
    expect(ProjectInput.safeParse({ ...project, slug: "x".repeat(80) }).success).toBe(true);
  });
  it.each([["title", 100], ["summary", 200], ["body", 20000], ["role", 200], ["category", 50], ["imageAlt", 200]] as const)("limits %s", (field, max) => {
    expect(ProjectInput.safeParse({ ...project, [field]: "x".repeat(max) }).success).toBe(true);
    rejectsAt(ProjectInput, { ...project, [field]: "x".repeat(max + 1) }, field);
  });
  it("limits technologies", () => {
    expect(ProjectInput.safeParse({ ...project, technologies: Array(20).fill("x".repeat(40)) }).success).toBe(true);
    rejectsAt(ProjectInput, { ...project, technologies: Array(21).fill("TS") }, "technologies");
    rejectsAt(ProjectInput, { ...project, technologies: ["x".repeat(41)] }, "technologies.0");
    rejectsAt(ProjectInput, { ...project, technologies: [" "] }, "technologies.0");
  });
  it("requires imageAlt when imageKey is set", () => {
    rejectsAt(ProjectInput, { ...project, imageKey, imageAlt: " " }, "imageAlt");
    expect(ProjectInput.safeParse({ ...project, imageKey, imageAlt: "Screenshot" }).success).toBe(true);
    rejectsAt(ProjectInput, { ...project, imageKey: pdfKey, imageAlt: "CV" }, "imageKey");
  });
  it("requires full PUT fields and strips server-managed fields", () => {
    rejectsAt(ProjectInput, { title: "Only a title" }, "slug");
    expect(ProjectInput.parse({ ...project, id: 1, updatedAt: "now", createdAt: "now" })).toEqual(project);
  });
});

describe("profile", () => {
  it("accepts the seed profile", () => expect(ProfileInput.parse(profile)).toEqual(profile));
  it("requires photoAlt when photoKey is set", () => {
    rejectsAt(ProfileInput, { ...profile, photoKey: imageKey }, "photoAlt");
    expect(ProfileInput.safeParse({ ...profile, photoKey: imageKey, photoAlt: "Portrait" }).success).toBe(true);
  });
  it.each([["name", 100], ["headline", 80], ["intro", 200], ["about", 3000],
    ["location", 100], ["availabilityText", 120], ["photoAlt", 200]] as const)("limits %s", (field, max) => {
    expect(ProfileInput.safeParse({ ...profile, [field]: "x".repeat(max) }).success).toBe(true);
    rejectsAt(ProfileInput, { ...profile, [field]: "x".repeat(max + 1) }, field);
  });
  it.each(["name", "headline", "intro", "email"])("requires %s", (field) => {
    rejectsAt(ProfileInput, { ...profile, [field]: " " }, field);
    const { [field]: omitted, ...rest } = profile as Record<string, unknown>;
    void omitted;
    rejectsAt(ProfileInput, rest, field);
  });
  it("rejects javascript and non-http URLs", () => {
    for (const githubUrl of ["javascript:alert(1)", "ftp://example.com", "/relative", "not a url"]) {
      rejectsAt(ProfileInput, { ...profile, githubUrl }, "githubUrl");
    }
    expect(ProfileInput.safeParse({ ...profile, githubUrl: "https://github.com/x" }).success).toBe(true);
    expect(ProfileInput.safeParse({ ...profile, linkedinUrl: "http://example.com" }).success).toBe(true);
  });
  it("validates email and its limit", () => {
    rejectsAt(ProfileInput, { ...profile, email: "invalid" }, "email");
    rejectsAt(ProfileInput, { ...profile, email: `${"x".repeat(190)}@example.com` }, "email");
  });
  it("uses image keys for photos and PDF keys for CVs", () => {
    rejectsAt(ProfileInput, { ...profile, photoKey: pdfKey, photoAlt: "CV" }, "photoKey");
    rejectsAt(ProfileInput, { ...profile, cvKey: imageKey }, "cvKey");
    expect(ProfileInput.safeParse({ ...profile, cvKey: pdfKey }).success).toBe(true);
  });
  it("trims form strings and converts blank nullable fields to null", () => {
    const parsed = ProfileInput.parse({ ...profile, name: " Yazan Mohammad ", location: "  ", githubUrl: "", photoKey: "", photoAlt: "", cvKey: "" });
    expect(parsed.name).toBe("Yazan Mohammad");
    for (const field of ["location", "githubUrl", "photoKey", "photoAlt", "cvKey"] as const) expect(parsed[field]).toBeNull();
  });
  it("omits server-managed fields", () => {
    expect(ProfileInput.parse({ ...profile, id: 1, updatedAt: "now", createdAt: "now" })).toEqual(profile);
  });
});
