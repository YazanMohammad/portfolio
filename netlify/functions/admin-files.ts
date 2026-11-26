import type { Config } from "@netlify/functions";
import { CV_MAX_BYTES, IMAGE_MAX_BYTES } from "../../shared/index";
import { adminHandler } from "../../server/handlers";
import { fail, json, notFound } from "../../server/http";
import { validateUpload, type UploadKind } from "../../server/uploads";
import { saveFile } from "../../server/blobs";

const PATH = "/api/admin/files";
// Room for the multipart boundaries and part headers around the file itself.
const ENVELOPE_BYTES = 64 * 1024;
const MAX_FILE: Record<UploadKind, number> = { image: IMAGE_MAX_BYTES, cv: CV_MAX_BYTES };
const TOO_LARGE = "That file is too large. The limit is 4 MB.";

function readKind(url: URL): UploadKind {
  const kinds = url.searchParams.getAll("kind");
  const kind = kinds.length === 1 ? kinds[0] : undefined;
  if (kind === "image" || kind === "cv") return kind;
  throw fail("validation", "Choose image or cv.", { fields: { kind: "Choose image or cv." } });
}

// Only multipart/form-data is read. Anything else is rejected before the body is touched.
function readContentType(req: Request): string {
  const type = req.headers.get("Content-Type") ?? "";
  if (type.split(";")[0].trim().toLowerCase() !== "multipart/form-data") {
    throw fail("validation", "Send the file as multipart form data.", { fields: { file: "Choose a file." } });
  }
  return type;
}

// A present Content-Length must be a plain number. Missing is allowed (chunked upload): the
// body is then read with a hard cap, so it can never fill memory.
function readContentLength(req: Request, max: number): number | null {
  const header = req.headers.get("Content-Length");
  if (header === null) return null;
  if (!/^\d{1,15}$/.test(header.trim())) throw fail("validation", "Invalid Content-Length.");
  const length = Number(header.trim());
  if (length > max) throw fail("too_large", TOO_LARGE);
  return length;
}

// Reads at most `max` bytes, and never more than the declared length. Stops and cancels the
// stream as soon as either limit is passed.
async function readBody(req: Request, max: number, declared: number | null): Promise<Uint8Array<ArrayBuffer>> {
  if (!req.body) throw fail("validation", "Choose a file.", { fields: { file: "Choose a file." } });
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > max) throw fail("too_large", TOO_LARGE);
      if (declared !== null && total > declared) throw fail("validation", "The body is longer than Content-Length.");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return body;
}

// Uploading only stores the file. It never changes the profile or projects: the admin saves the
// returned key through the profile or project form.
export default adminHandler(async req => {
  const url = new URL(req.url);
  if (url.pathname !== PATH || req.method !== "POST") throw notFound();
  const kind = readKind(url);
  const contentType = readContentType(req);
  const max = MAX_FILE[kind] + ENVELOPE_BYTES;
  const declared = readContentLength(req, max);
  const body = await readBody(req, max, declared);

  let form: FormData;
  try {
    form = await new Response(body, { headers: { "Content-Type": contentType } }).formData();
  } catch {
    throw fail("validation", "Could not read the form.", { fields: { file: "Choose a file." } });
  }
  const { bytes, contentType: type, ext } = await validateUpload(kind, form.get("file"));
  const result = await saveFile(bytes, ext, type);
  return json(result, { status: 201, headers: { "Cache-Control": "no-store" } });
});

export const config: Config = { path: "/api/admin/files" };
