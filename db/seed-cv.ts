import { readFile, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { CV_MAX_BYTES } from "../shared/index";
import { detectFileType } from "../server/uploads";
import { CV_SOURCE_URL } from "./seed-data";

export const DEFAULT_CV_PATH = "C:/Projects/Personal/CV maker/master/Yazan_Mohammad_CV.pdf";
export type CvSourceOptions = {
  cvPath?: string | null;
  defaultCvPath?: string | null;
  fetchCv?: typeof fetch;
};

export async function loadCvBytes(options: CvSourceOptions = {}): Promise<Uint8Array> {
  const configured = options.cvPath === undefined ? process.env.CV_PATH : options.cvPath;
  let path = configured || null;
  if (path && !isAbsolute(path)) throw new Error("CV_PATH must be an absolute path to a PDF");
  if (!path) {
    const candidate = options.defaultCvPath === undefined ? DEFAULT_CV_PATH : options.defaultCvPath;
    if (candidate) {
      try {
        await stat(candidate);
        path = candidate;
      } catch (error) {
        // Only a missing default permits the legacy URL; permission/read errors must surface.
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }
  let bytes: Uint8Array;
  if (path) {
    const info = await stat(path);
    if (!info.isFile()) throw new Error("CV_PATH must name a PDF file");
    if (info.size > CV_MAX_BYTES) throw new Error("file is larger than 4 MB");
    bytes = new Uint8Array(await readFile(path));
  } else {
    const response = await (options.fetchCv ?? fetch)(CV_SOURCE_URL, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`download failed with status ${response.status}`);
    bytes = new Uint8Array(await response.arrayBuffer());
  }
  if (bytes.byteLength > CV_MAX_BYTES) throw new Error("file is larger than 4 MB");
  if (detectFileType(bytes)?.contentType !== "application/pdf") throw new Error("the CV is not a PDF");
  return bytes;
}
