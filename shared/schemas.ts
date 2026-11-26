import { z } from "zod";
import { fileKey, nullable, slug, url, yearMonth } from "./primitives";

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => nullable(z.string().trim().max(max));
const imageKey = nullable(fileKey.refine((key) => !key.endsWith(".pdf"), "Use an image key."));
const cvKey = nullable(fileKey.refine((key) => key.endsWith(".pdf"), "Use a PDF key."));
const email = text(200).email();

export const ProfileInput = z.object({
  name: text(100),
  headline: text(80),
  intro: text(200),
  about: z.string().trim().max(3000),
  location: optionalText(100),
  email,
  githubUrl: nullable(url),
  linkedinUrl: nullable(url),
  available: z.boolean(),
  availabilityText: optionalText(120),
  photoKey: imageKey,
  photoAlt: optionalText(200),
  cvKey,
}).refine((value) => !value.photoKey || !!value.photoAlt, {
  path: ["photoAlt"], message: "Add alt text for the photo.",
});
export type ProfileInput = z.infer<typeof ProfileInput>;

export const ProjectInput = z.object({
  slug,
  title: text(100),
  summary: text(200),
  body: z.string().trim().max(20000),
  role: optionalText(200),
  category: text(50),
  technologies: z.array(text(40)).max(20),
  liveUrl: nullable(url),
  githubUrl: nullable(url),
  imageKey,
  imageAlt: optionalText(200),
  featured: z.boolean(),
  isVisible: z.boolean(),
  sortOrder: z.number().int().min(0),
}).refine((value) => !value.imageKey || !!value.imageAlt, {
  path: ["imageAlt"], message: "Add alt text for the image.",
});
export type ProjectInput = z.infer<typeof ProjectInput>;

const datesInOrder = (value: { startDate: string | null; endDate: string | null }) =>
  !value.startDate || !value.endDate || value.startDate <= value.endDate;
const dateOrderError = { path: ["endDate"], message: "End date must not precede start date." };

export const ExperienceInput = z.object({
  position: text(100),
  company: optionalText(100),
  location: optionalText(100),
  startDate: nullable(yearMonth),
  endDate: nullable(yearMonth),
  current: z.boolean(),
  bullets: z.array(text(300)).max(10),
  isVisible: z.boolean(),
  sortOrder: z.number().int().min(0),
}).refine((value) => !value.current || value.endDate === null, {
  path: ["endDate"], message: "Current experience must have no end date.",
}).refine(datesInOrder, dateOrderError);
export type ExperienceInput = z.infer<typeof ExperienceInput>;

export const EducationInput = z.object({
  degree: text(100),
  school: text(100),
  location: nullable(z.string().trim()),
  startDate: nullable(yearMonth),
  endDate: nullable(yearMonth),
  description: optionalText(1000),
  isVisible: z.boolean(),
  sortOrder: z.number().int().min(0),
}).refine(datesInOrder, dateOrderError);
export type EducationInput = z.infer<typeof EducationInput>;

export const SkillInput = z.object({
  name: text(50),
  category: text(50),
  iconSlug: optionalText(50),
  isVisible: z.boolean(),
  sortOrder: z.number().int().min(0),
});
export type SkillInput = z.infer<typeof SkillInput>;

export const ReorderInput = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(200).refine(
    (ids) => new Set(ids).size === ids.length, "IDs must be unique.",
  ),
});
export type ReorderInput = z.infer<typeof ReorderInput>;

export const MessageInput = z.object({
  name: text(100),
  email,
  subject: optionalText(150).optional(),
  message: text(5000),
  website: z.literal(""),
});
export type MessageInput = z.infer<typeof MessageInput>;

export const MessagePatch = z.object({
  isRead: z.boolean().optional(),
  archived: z.boolean().optional(),
}).refine((value) => value.isRead !== undefined || value.archived !== undefined, {
  message: "Set isRead or archived.",
});
export type MessagePatch = z.infer<typeof MessagePatch>;

// Login accepts any bounded username: rules are not revealed, every mismatch is the same 401.
export const LoginInput = z.object({ username: z.string().min(1).max(200), password: z.string().min(1).max(200) });
export type LoginInput = z.infer<typeof LoginInput>;

// The admin account (admin:create CLI and the Account page). Passwords are kept as typed
// (no trim); length counts characters, not UTF-16 units.
export const ADMIN_PASSWORD_MIN = 12;
export const AdminUsername = z.string().trim().min(3, "Use 3 to 64 characters.").max(64, "Use 3 to 64 characters.");
export const AdminPassword = z.string().max(200, "Use at most 200 characters.")
  .refine((value) => [...value].length >= ADMIN_PASSWORD_MIN, `Use at least ${ADMIN_PASSWORD_MIN} characters.`);

// PUT /api/admin/account. Omit newPassword to keep the password.
export const AccountInput = z.object({
  currentPassword: z.string().min(1, "Enter your current password.").max(200),
  username: AdminUsername,
  newPassword: AdminPassword.optional(),
}).strict();
export type AccountInput = z.infer<typeof AccountInput>;
