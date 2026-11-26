import type { z } from "zod";
import type { fileKey, yearMonth } from "./primitives";
import type {
  EducationInput, ExperienceInput, MessageInput, ProfileInput, ProjectInput, SkillInput,
} from "./schemas";

export type YearMonth = z.infer<typeof yearMonth>;
export type FileKey = z.infer<typeof fileKey>;
export type IsoDateTime = string;
export type Url = string;

export type Profile = ProfileInput & { updatedAt: IsoDateTime };
export type Project = ProjectInput & { id: number };
export type ProjectCard = Omit<Project, "body" | "isVisible">;
export type Experience = ExperienceInput & { id: number };
export type Education = EducationInput & { id: number };
export type Skill = SkillInput & { id: number };
export type Message = Omit<MessageInput, "website" | "subject"> & {
  id: number;
  subject: string | null;
  isRead: boolean;
  archivedAt: IsoDateTime | null;
  createdAt: IsoDateTime;
};

export type PublicContent = {
  settings?: ReturnType<typeof import("./settings").mergeSettings>;
  profile: Omit<Profile, "cvKey" | "photoKey"> & { photoUrl: string | null; cvUrl: "/cv" | null };
  projects: ProjectCard[];
  experience: Omit<Experience, "isVisible">[];
  education: Omit<Education, "isVisible">[];
  skills: Omit<Skill, "isVisible">[];
};
export type PublicProject = Omit<Project, "isVisible"> & { imageUrl: string | null };
export type FillInItem = {
  section: "profile" | "projects" | "experience" | "education";
  id: number | null;
  field: string;
  label: string;
};
export type AdminSummary = {
  unreadCount: number;
  recentMessages: Message[];
  counts: { projects: number; experience: number; education: number; skills: number; messages: number };
  toFillIn: FillInItem[];
  lastSavedAt: IsoDateTime | null;
};
export type UploadResult = { key: FileKey; url: string; contentType: string; size: number };

export type ErrorCode = "validation" | "unauthorized" | "forbidden_origin" | "not_found" | "conflict"
  | "too_large" | "unsupported_type" | "rate_limited" | "server";
export type ApiError = { error: { code: ErrorCode; message: string; fields?: Record<string, string> } };
export const ERROR_STATUS: Record<ErrorCode, number> = {
  validation: 400,
  unauthorized: 401,
  forbidden_origin: 403,
  not_found: 404,
  conflict: 409,
  too_large: 413,
  unsupported_type: 415,
  rate_limited: 429,
  server: 500,
};
