import type * as db from "../db/schema";
import { sanitizeSvg } from "../shared/svg";
import type { Education, EducationInput, Experience, ExperienceInput, Message, Profile, ProfileInput,
  Project, ProjectInput, PublicContent, PublicProject, Skill, SkillInput, YearMonth } from "../shared/index";

type ProfileRow = typeof db.profile.$inferSelect;
type ProjectRow = typeof db.projects.$inferSelect;
type ExperienceRow = typeof db.experience.$inferSelect;
type EducationRow = typeof db.education.$inferSelect;
type SkillRow = typeof db.skills.$inferSelect;
type MessageRow = typeof db.messages.$inferSelect;

export function ymToDate(ym: YearMonth | null): string | null {
  return ym === null ? null : `${ym}-01`;
}

export function dateToYm(d: string | null): YearMonth | null {
  return d === null ? null : d.slice(0, 7);
}

export function toProfile(row: ProfileRow): Profile {
  return { name: row.name, headline: row.headline, intro: row.intro, about: row.about,
    location: row.location, email: row.email, githubUrl: row.githubUrl, linkedinUrl: row.linkedinUrl,
    available: row.available, availabilityText: row.availabilityText, photoKey: row.photoKey,
    photoAlt: row.photoAlt, cvKey: row.cvKey, updatedAt: row.updatedAt.toISOString() };
}

export function toProject(row: ProjectRow): Project {
  return { id: row.id, slug: row.slug, title: row.title, summary: row.summary, body: row.body,
    role: row.role, category: row.category, technologies: row.technologies, liveUrl: row.liveUrl,
    githubUrl: row.githubUrl, imageKey: row.imageKey, imageAlt: row.imageAlt, featured: row.featured,
    isVisible: row.isVisible, sortOrder: row.sortOrder };
}

export function toExperience(row: ExperienceRow): Experience {
  return { id: row.id, position: row.position, company: row.company, location: row.location,
    startDate: dateToYm(row.startDate), endDate: dateToYm(row.endDate), current: row.current,
    bullets: row.bullets, isVisible: row.isVisible, sortOrder: row.sortOrder };
}

export function toEducation(row: EducationRow): Education {
  return { id: row.id, degree: row.degree, school: row.school, location: row.location,
    startDate: dateToYm(row.startDate), endDate: dateToYm(row.endDate), description: row.description,
    isVisible: row.isVisible, sortOrder: row.sortOrder };
}

export function toSkill(row: SkillRow): Skill {
  return { id: row.id, name: row.name, category: row.category, iconSlug: row.iconSlug, iconSvg: row.iconSvg ?? null,
    isVisible: row.isVisible, sortOrder: row.sortOrder };
}

export function toMessage(row: MessageRow): Message {
  return { id: row.id, name: row.name, email: row.email, subject: row.subject, message: row.message,
    isRead: row.isRead, archivedAt: row.archivedAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString() };
}

export function projectToRow(input: ProjectInput): Omit<ProjectRow, "id"> {
  return { slug: input.slug, title: input.title, summary: input.summary, body: input.body,
    role: input.role, category: input.category, technologies: input.technologies, liveUrl: input.liveUrl,
    githubUrl: input.githubUrl, imageKey: input.imageKey, imageAlt: input.imageAlt, featured: input.featured,
    isVisible: input.isVisible, sortOrder: input.sortOrder };
}

export function experienceToRow(input: ExperienceInput): Omit<ExperienceRow, "id"> {
  return { position: input.position, company: input.company, location: input.location,
    startDate: ymToDate(input.startDate), endDate: ymToDate(input.endDate), current: input.current,
    bullets: input.bullets, isVisible: input.isVisible, sortOrder: input.sortOrder };
}

export function educationToRow(input: EducationInput): Omit<EducationRow, "id"> {
  return { degree: input.degree, school: input.school, location: input.location,
    startDate: ymToDate(input.startDate), endDate: ymToDate(input.endDate), description: input.description,
    isVisible: input.isVisible, sortOrder: input.sortOrder };
}

export function skillToRow(input: SkillInput): Omit<SkillRow, "id"> {
  return { name: input.name, category: input.category, iconSlug: input.iconSlug,
    iconSvg: input.iconSvg ? sanitizeSvg(input.iconSvg) : null,
    isVisible: input.isVisible, sortOrder: input.sortOrder };
}

export function profileToRow(input: ProfileInput): Omit<ProfileRow, "id"> {
  return { name: input.name, headline: input.headline, intro: input.intro, about: input.about,
    location: input.location, email: input.email, githubUrl: input.githubUrl, linkedinUrl: input.linkedinUrl,
    available: input.available, availabilityText: input.availabilityText, photoKey: input.photoKey,
    photoAlt: input.photoAlt, cvKey: input.cvKey, updatedAt: new Date() };
}

function fileUrl(key: string | null): string | null {
  return key === null ? null : `/api/files/${encodeURIComponent(key)}`;
}

function withoutVisibility<T extends { isVisible: boolean }>(item: T): Omit<T, "isVisible"> {
  const { isVisible, ...result } = item;
  void isVisible;
  return result;
}

const bySortOrder = (a: { sortOrder: number }, b: { sortOrder: number }) => a.sortOrder - b.sortOrder;

type ContentRows = { profile: ProfileRow; projects: ProjectRow[]; experience: ExperienceRow[];
  education: EducationRow[]; skills: SkillRow[] };

export function toPublicContent(rows: ContentRows): PublicContent {
  const { cvKey, photoKey, ...profile } = toProfile(rows.profile);
  return {
    profile: { ...profile, photoUrl: fileUrl(photoKey), cvUrl: cvKey ? "/cv" : null },
    projects: rows.projects.filter((row) => row.isVisible)
      .sort((a, b) => Number(b.featured) - Number(a.featured) || bySortOrder(a, b))
      .map((row) => {
        const { body, ...card } = withoutVisibility(toProject(row));
        void body;
        return card;
      }),
    experience: rows.experience.filter((row) => row.isVisible)
      .sort((a, b) => Number(b.current) - Number(a.current) || bySortOrder(a, b))
      .map((row) => withoutVisibility(toExperience(row))),
    education: rows.education.filter((row) => row.isVisible).sort(bySortOrder)
      .map((row) => withoutVisibility(toEducation(row))),
    skills: rows.skills.filter((row) => row.isVisible).sort(bySortOrder)
      .map((row) => withoutVisibility(toSkill(row))),
  };
}

export function toPublicProject(row: ProjectRow): PublicProject {
  return { ...withoutVisibility(toProject(row)), imageUrl: fileUrl(row.imageKey) };
}
