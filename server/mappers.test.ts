import { afterEach, expect, it, vi } from "vitest";
import type * as db from "../db/schema";
import { toProfile, toProject, toExperience, toEducation, toSkill, toMessage, projectToRow,
  experienceToRow, educationToRow, skillToRow, profileToRow, toPublicContent, toPublicProject, ymToDate, dateToYm } from "./mappers";

const now = new Date("2026-11-25T12:00:00.000Z");
const profile: typeof db.profile.$inferSelect = { id: 1, name: "Ada", headline: "Engineer", intro: "Hello", about: "About", location: null,
  email: "ada@example.com", githubUrl: null, linkedinUrl: null, available: true, availabilityText: null,
  photoKey: "portrait.jpg", photoAlt: "Portrait", cvKey: "resume.pdf", updatedAt: now };
const project: typeof db.projects.$inferSelect = { id: 1, slug: "app", title: "App", summary: "Summary", body: "Body", role: null,
  category: "Web", technologies: ["TS"], liveUrl: null, githubUrl: null, imageKey: "image.jpg", imageAlt: "Image",
  featured: false, isVisible: true, sortOrder: 0 };
const experience: typeof db.experience.$inferSelect = { id: 1, position: "Engineer", company: null, location: null, startDate: "2024-09-01",
  endDate: "2025-01-01", current: false, bullets: ["Built it"], isVisible: true, sortOrder: 0 };
const education: typeof db.education.$inferSelect = { id: 1, degree: "CS", school: "University", location: null, startDate: "2021-01-01",
  endDate: "2024-01-01", description: null, isVisible: true, sortOrder: 0 };
const skill: typeof db.skills.$inferSelect = { id: 1, name: "TS", category: "Language", iconSlug: null, iconSvg: null, isVisible: true, sortOrder: 0 };
const rows = () => ({ profile, projects: [project], experience: [experience], education: [education], skills: [skill] });
afterEach(() => vi.useRealTimers());
it('ymToDate and dateToYm round-trip "2024-09"', () => {
  expect(ymToDate("2024-09")).toBe("2024-09-01");
  expect(dateToYm(ymToDate("2024-09"))).toBe("2024-09");
});
it("null stays null", () => {
  expect(ymToDate(null)).toBeNull();
  expect(dateToYm(null)).toBeNull();
});
it("row mappers emit exact contract fields and ISO timestamps", () => {
  const { id, ...profileFields } = profile;
  void id;
  expect(toProfile(profile)).toEqual({ ...profileFields, updatedAt: now.toISOString() });
  expect(toProject(project)).toEqual(project);
  expect(toExperience(experience)).toEqual({ ...experience, startDate: "2024-09", endDate: "2025-01" });
  expect(toEducation(education)).toEqual({ ...education, startDate: "2021-01", endDate: "2024-01" });
  expect(toSkill(skill)).toEqual(skill);
  const message = { id: 1, name: "Visitor", email: "v@example.com", subject: null, message: "Hello", isRead: false,
    archivedAt: now, createdAt: now, ipHash: "private" };
  const { ipHash, ...messageFields } = message;
  void ipHash;
  expect(toMessage(message)).toEqual({ ...messageFields, archivedAt: now.toISOString(), createdAt: now.toISOString() });
  expect(toMessage({ ...message, archivedAt: null }).archivedAt).toBeNull();
});
it("input mappers omit managed fields and convert year-month dates", () => {
  const { id: projectId, ...projectInput } = project;
  const { id: skillId, ...skillInput } = skill;
  const { id: experienceId, ...experienceInput } = toExperience(experience);
  const { id: educationId, ...educationInput } = toEducation(education);
  void [projectId, skillId, experienceId, educationId];
  expect(projectToRow(projectInput)).toEqual(projectInput);
  expect(skillToRow(skillInput)).toEqual(skillInput);
  expect(experienceToRow(experienceInput)).toEqual({ ...experienceInput, startDate: "2024-09-01", endDate: "2025-01-01" });
  expect(educationToRow(educationInput)).toEqual({ ...educationInput, startDate: "2021-01-01", endDate: "2024-01-01" });
  expect(experienceToRow({ ...experienceInput, startDate: null, endDate: null }).startDate).toBeNull();
});
it("profileToRow sets updatedAt to now for updates", () => {
  vi.useFakeTimers(); vi.setSystemTime(now);
  const { updatedAt, ...input } = toProfile(profile);
  void updatedAt;
  expect(profileToRow(input)).toEqual({ ...input, updatedAt: now });
});
it("toPublicContent drops hidden rows and the cvKey", () => {
  const input = rows();
  input.projects.push({ ...project, id: 2, isVisible: false });
  input.experience.push({ ...experience, id: 2, isVisible: false });
  input.education.push({ ...education, id: 2, isVisible: false });
  input.skills.push({ ...skill, id: 2, isVisible: false });
  const content = toPublicContent(input);
  expect(content.profile).not.toHaveProperty("cvKey");
  expect(content.profile).not.toHaveProperty("photoKey");
  expect(content.profile).not.toHaveProperty("id");
  expect(content.profile.photoUrl).toBe("/api/files/portrait.jpg");
  for (const items of [content.projects, content.experience, content.education, content.skills]) {
    expect(items.map((item) => item.id)).toEqual([1]);
    expect(items[0]).not.toHaveProperty("isVisible");
  }
  expect(content.projects[0]).not.toHaveProperty("body");
  expect(input.projects).toHaveLength(2);
});
it("current experience sorts first", () => {
  const input = rows();
  input.experience = [experience, { ...experience, id: 2, current: true, endDate: null, sortOrder: 9 },
    { ...experience, id: 3, current: true, endDate: null, sortOrder: 2 }];
  expect(toPublicContent(input).experience.map((item) => item.id)).toEqual([3, 2, 1]);
  expect(input.experience.map((item) => item.id)).toEqual([1, 2, 3]);
});
it("featured project sorts first", () => {
  const input = rows();
  input.projects = [project, { ...project, id: 2, featured: true, sortOrder: 9 }, { ...project, id: 3, featured: true, sortOrder: 2 }];
  expect(toPublicContent(input).projects.map((item) => item.id)).toEqual([3, 2, 1]);
});
it("education and skills sort by sortOrder", () => {
  const input = rows();
  input.education = [{ ...education, id: 2, sortOrder: 5 }, education];
  input.skills = [{ ...skill, id: 2, sortOrder: 5 }, skill];
  expect(toPublicContent(input).education.map((item) => item.id)).toEqual([1, 2]);
  expect(toPublicContent(input).skills.map((item) => item.id)).toEqual([1, 2]);
});
it('cvUrl is "/cv" only when cvKey set', () => {
  expect(toPublicContent(rows()).profile.cvUrl).toBe("/cv");
  expect(toPublicContent({ ...rows(), profile: { ...profile, cvKey: null, photoKey: null } }).profile).toMatchObject({ cvUrl: null, photoUrl: null });
});
it("toPublicProject removes visibility and provides an encoded image URL", () => {
  const { isVisible, ...fields } = project;
  void isVisible;
  expect(toPublicProject(project)).toEqual({ ...fields, imageUrl: "/api/files/image.jpg" });
  expect(toPublicProject({ ...project, imageKey: null }).imageUrl).toBeNull();
  expect(toPublicProject({ ...project, imageKey: "a/b.jpg" }).imageUrl).toBe("/api/files/a%2Fb.jpg");
});
