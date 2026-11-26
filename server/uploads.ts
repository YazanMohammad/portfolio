import { CV_MAX_BYTES, IMAGE_MAX_BYTES } from "../shared/index";
import { fail } from "./http";

export type DetectedType =
  | { contentType: "image/jpeg"; ext: "jpg" }
  | { contentType: "image/png"; ext: "png" }
  | { contentType: "image/webp"; ext: "webp" }
  | { contentType: "application/pdf"; ext: "pdf" };

export type UploadKind = "image" | "cv";

const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const RIFF = [0x52, 0x49, 0x46, 0x46]; // "RIFF"
const WEBP = [0x57, 0x45, 0x42, 0x50]; // "WEBP"
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

// True when `bytes` holds `sig` starting at `offset`. Short input is just false.
function hasAt(bytes: Uint8Array, sig: number[], offset = 0): boolean {
  if (bytes.length < offset + sig.length) return false;
  return sig.every((value, i) => bytes[offset + i] === value);
}

// Type comes only from the first bytes. Names and declared types are never trusted.
export function detectFileType(bytes: Uint8Array): DetectedType | null {
  if (hasAt(bytes, JPEG)) return { contentType: "image/jpeg", ext: "jpg" };
  if (hasAt(bytes, PNG)) return { contentType: "image/png", ext: "png" };
  if (bytes.length >= 12 && hasAt(bytes, RIFF) && hasAt(bytes, WEBP, 8)) return { contentType: "image/webp", ext: "webp" };
  if (hasAt(bytes, PDF)) return { contentType: "application/pdf", ext: "pdf" };
  return null;
}

const RULES: Record<UploadKind, { maxBytes: number; types: readonly DetectedType["contentType"][] }> = {
  image: { maxBytes: IMAGE_MAX_BYTES, types: ["image/jpeg", "image/png", "image/webp"] },
  cv: { maxBytes: CV_MAX_BYTES, types: ["application/pdf"] },
};

const TOO_LARGE = "That file is too large. The limit is 4 MB.";

export async function validateUpload(
  kind: UploadKind,
  file: unknown,
): Promise<{ bytes: Uint8Array; contentType: string; ext: string }> {
  if (!(file instanceof File)) {
    throw fail("validation", "Choose a file.", { fields: { file: "Choose a file." } });
  }
  const rule = RULES[kind];
  // Check the size before reading, so a huge file is never loaded.
  if (file.size > rule.maxBytes) throw fail("too_large", TOO_LARGE);
  if (file.size === 0) throw fail("validation", "That file is empty.", { fields: { file: "That file is empty." } });

  const bytes = new Uint8Array(await file.arrayBuffer());
  // Check again: the real length is what counts.
  if (bytes.byteLength > rule.maxBytes) throw fail("too_large", TOO_LARGE);
  if (bytes.byteLength === 0) throw fail("validation", "That file is empty.", { fields: { file: "That file is empty." } });

  const type = detectFileType(bytes);
  if (!type || !rule.types.includes(type.contentType)) throw fail("unsupported_type", "That file type is not allowed.");
  return { bytes, contentType: type.contentType, ext: type.ext };
}
