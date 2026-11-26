import { expect, it } from "vitest";
import { computeToFillIn } from "./to-fill-in";
import type * as schema from "../db/schema";
type ProfileRow = typeof schema.profile.$inferSelect;
type ProjectRow = typeof schema.projects.$inferSelect;
type ExperienceRow = typeof schema.experience.$inferSelect;
type EducationRow = typeof schema.education.$inferSelect;
const profile: ProfileRow = { id: 1, name: "Person", headline: "Engineer", intro: "Hi", about: "", email: "p@example.com", location: "Jordan", githubUrl: null, linkedinUrl: null, available: false, availabilityText: null, photoKey: "photo", photoAlt: "Portrait", cvKey: "cv", updatedAt: new Date() };
const project: ProjectRow = { id: 1, slug: "one", title: "One", summary: "Summary", body: "Body", category: "Web", technologies: [], role: null, liveUrl: null, githubUrl: null, imageKey: "image", imageAlt: "Image", featured: false, isVisible: true, sortOrder: 0 };
const experience: ExperienceRow = { id: 2, position: "Engineer", company: "Company", location: null, startDate: "2020-01-01", endDate: null, current: true, bullets: ["Work"], isVisible: true, sortOrder: 0 };
const education: EducationRow = { id: 3, degree: "Degree", school: "School", location: null, startDate: "2020-01-01", endDate: "2024-01-01", description: null, isVisible: true, sortOrder: 0 };
const data = { profile, projects: [project], experience: [experience], education: [education] };
it("empty cv and photo are listed with contract labels", () => {
  expect(computeToFillIn({ ...data, profile: { ...profile, cvKey: null, photoKey: null } })).toEqual([
    { section: "profile", id: null, field: "cvKey", label: "CV" },
    { section: "profile", id: null, field: "photoKey", label: "Photo" },
  ]);
});
it("hidden rows are skipped", () => {
  expect(computeToFillIn({ ...data, projects: [{ ...project, imageKey: null, body: "", isVisible: false }], experience: [{ ...experience, company: null, startDate: null, bullets: [], isVisible: false }], education: [{ ...education, startDate: null, endDate: null, isVisible: false }] })).toEqual([]);
});
it("availabilityText only when available", () => {
  expect(computeToFillIn(data)).toEqual([]);
  expect(computeToFillIn({ ...data, profile: { ...profile, available: true } })).toEqual([{ section: "profile", id: null, field: "availabilityText", label: "Availability text" }]);
});
it("current role with no company is listed", () => {
  expect(computeToFillIn({ ...data, experience: [{ ...experience, company: null }] })).toEqual([{ section: "experience", id: 2, field: "company", label: "Company" }]);
});
it("complete data gives an empty list", () => { expect(computeToFillIn(data)).toEqual([]); });
it("lists only the specified visible fields, not optional location or current end date", () => {
  expect(computeToFillIn({ profile: { ...profile, location: " " }, projects: [{ ...project, imageKey: null, body: " " }], experience: [{ ...experience, startDate: null, bullets: [] }], education: [{ ...education, startDate: null, endDate: null }] }).map(item => [item.section, item.id, item.field])).toEqual([
    ["profile", null, "location"], ["projects", 1, "imageKey"], ["projects", 1, "body"], ["experience", 2, "startDate"], ["experience", 2, "bullets"], ["education", 3, "startDate"], ["education", 3, "endDate"],
  ]);
});
it("missing profile reports its four missing facts without inventing availability", () => {
  expect(computeToFillIn({ ...data, profile: null }).map(item => item.field)).toEqual(["cvKey", "photoKey", "location"]);
});
