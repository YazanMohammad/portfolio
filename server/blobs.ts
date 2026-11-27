import { randomBytes } from "node:crypto";
import { getStore } from "@netlify/blobs";
import { fileKey, type UploadResult } from "../shared/index";
import { saveLocalFile, getLocalFile, deleteLocalFile } from "./filesystem";

const STORE = "files";
const EXTENSIONS = new Set(["jpg", "png", "webp", "pdf"]);

// Site ID and token are only set for the local seed script. Functions get them from Netlify.
function filesStore() {
  const siteID = process.env.BLOBS_SITE_ID;
  const token = process.env.BLOBS_TOKEN;
  if (siteID && token) return getStore({ name: STORE, siteID, token });
  return getStore(STORE);
}

function isFileKey(key: unknown): key is string {
  return typeof key === "string" && fileKey.safeParse(key).success && key === key.trim();
}

export function newFileKey(ext: string): string {
  if (!EXTENSIONS.has(ext)) throw new Error("Unknown file extension.");
  return `${randomBytes(16).toString("hex")}.${ext}`;
}

export async function saveFile(bytes: Uint8Array, ext: string, contentType: string): Promise<UploadResult> {
  const key = newFileKey(ext);
  // Copy into a plain ArrayBuffer so only these bytes are stored, not a larger backing buffer.
  const data = new Uint8Array(bytes).buffer; // copies only the view's bytes
  if (process.env.FILES_DIR) await saveLocalFile(key, bytes, contentType);
  else await filesStore().set(key, data, { metadata: { contentType } });
  return { key, url: `/api/files/${key}`, contentType, size: bytes.byteLength };
}

export async function getFile(key: string): Promise<{ bytes: ArrayBuffer; contentType: string; size: number } | null> {
  // Check the key before any store call: no path tricks reach the store.
  if (!isFileKey(key)) return null;
  if (process.env.FILES_DIR) return getLocalFile(key);
  const result = await filesStore().getWithMetadata(key, { type: "arrayBuffer" });
  if (!result) return null;
  const stored = result.metadata?.contentType;
  const contentType = typeof stored === "string" && stored !== "" ? stored : "application/octet-stream";
  return { bytes: result.data, contentType, size: result.data.byteLength };
}

// Best effort: a failed delete leaves an orphan blob, which is harmless.
export async function deleteFile(key: string | null | undefined): Promise<void> {
  if (!key) return;
  if (!isFileKey(key)) {
    console.error("Skipped deleting a file with an invalid key.");
    return;
  }
  try {
    if (process.env.FILES_DIR) await deleteLocalFile(key);
    else await filesStore().delete(key);
  } catch {
    // Do not log the error or key: either may hold secrets or user data.
    console.error("Could not delete a stored file.");
  }
}
