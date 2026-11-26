import type * as schema from "../db/schema";
import type { FillInItem } from "../shared/index";
type ProfileRow = typeof schema.profile.$inferSelect;
type ProjectRow = typeof schema.projects.$inferSelect;
type ExperienceRow = typeof schema.experience.$inferSelect;
type EducationRow = typeof schema.education.$inferSelect;

export function computeToFillIn(data: { profile: ProfileRow | null; projects: ProjectRow[];
  experience: ExperienceRow[]; education: EducationRow[] }): FillInItem[] {
  const result: FillInItem[] = [];
  const add = (section: FillInItem["section"], id: number | null, field: string, label: string) => {
    result.push({ section, id, field, label });
  };
  const missing = (value: string | null | undefined) => !value?.trim();
  for (const [field, label] of [["cvKey", "CV"], ["photoKey", "Photo"], ["location", "Location"]] as const) {
    if (missing(data.profile?.[field])) add("profile", null, field, label);
  }
  if (data.profile?.available && missing(data.profile.availabilityText)) {
    add("profile", null, "availabilityText", "Availability text");
  }
  for (const row of data.projects.filter(row => row.isVisible)) {
    if (missing(row.imageKey)) add("projects", row.id, "imageKey", "Image");
    if (missing(row.body)) add("projects", row.id, "body", "Body");
  }
  for (const row of data.experience.filter(row => row.isVisible)) {
    if (missing(row.company)) add("experience", row.id, "company", "Company");
    if (missing(row.startDate)) add("experience", row.id, "startDate", "Start date");
    if (!row.bullets.length) add("experience", row.id, "bullets", "Bullets");
  }
  for (const row of data.education.filter(row => row.isVisible)) {
    if (missing(row.startDate)) add("education", row.id, "startDate", "Start date");
    if (missing(row.endDate)) add("education", row.id, "endDate", "End date");
  }
  return result;
}
