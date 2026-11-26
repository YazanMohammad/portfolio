import { z } from "zod";

export const IMAGE_MAX_BYTES = 4 * 1024 * 1024;
export const CV_MAX_BYTES = 4 * 1024 * 1024;
export const COLLECTIONS = ["projects", "experience", "education", "skills"] as const;
export type Collection = (typeof COLLECTIONS)[number];

export const url = z.string().trim().url().refine(
  (value) => /^https?:\/\//i.test(value),
  "Use an absolute HTTP or HTTPS URL.",
);
export const yearMonth = z.string().trim().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const slug = z.string().trim().min(1).max(80).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
export const fileKey = z.string().trim().regex(/^[a-f0-9]{32}\.(jpg|png|webp|pdf)$/);

export function nullable<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? null : value,
    schema.nullable(),
  );
}
