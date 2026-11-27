import { constants } from "node:fs";
import { chmod, lstat, mkdir, open, readdir, rename, unlink } from "node:fs/promises";
import { resolve, join, isAbsolute } from "node:path";
import { randomBytes } from "node:crypto";
import { fileKey } from "../shared/index";

const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf" };

const initialized = new Map<string, Promise<string>>();
export async function initializeFilesDirectory(): Promise<string> {
  const configured = process.env.FILES_DIR;
  if (!configured || !isAbsolute(configured)) throw new Error("FILES_DIR must be an absolute path.");
  const root = resolve(configured);
  let pending = initialized.get(root);
  if (!pending) {
    pending = (async () => {
      await mkdir(root, { recursive: true, mode: 0o700 });
      await chmod(root, 0o700);
      // Only stale files in our private temp namespace; never touch recent/active writers.
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      for (const name of await readdir(root)) {
        if (!/^\.[a-f0-9]{32}\.tmp$/.test(name)) continue;
        const path = join(root, name);
        try { const info = await lstat(path); if (info.isFile() && info.mtimeMs < cutoff) await unlink(path); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      }
      return root;
    })();
    initialized.set(root, pending);
    void pending.catch(() => initialized.delete(root));
  }
  return pending;
}
const directory = initializeFilesDirectory;
async function syncDirectory(root: string): Promise<void> {
  // Windows does not support opening directory handles through fs.open. Linux does.
  if (process.platform === "win32") return;
  const directory = await open(root, "r");
  try { await directory.sync(); } finally { await directory.close(); }
}

export async function saveLocalFile(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
  if (!fileKey.safeParse(key).success || key !== key.trim()) throw new Error("Invalid file key.");
  const expected = TYPES[key.split(".").at(-1)!];
  if (!expected || contentType !== expected) throw new Error("Invalid file content type.");
  const root = await directory();
  const temporary = join(root, `.${randomBytes(16).toString("hex")}.tmp`);
  try {
    const file = await open(temporary, "wx", 0o600);
    try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
    // A single rename publishes a complete file. Type is derived from the schema-validated extension.
    await rename(temporary, join(root, key));
    await syncDirectory(root);
  } finally { await unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; }); }
}

export async function getLocalFile(key: string): Promise<{ bytes: ArrayBuffer; contentType: string; size: number } | null> {
  if (!fileKey.safeParse(key).success || key !== key.trim()) return null;
  const path = join(await directory(), key);
  try {
    if (!(await lstat(path)).isFile()) return null;
    const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      if (!(await file.stat()).isFile()) return null;
      const bytes = new Uint8Array(await file.readFile()).buffer;
      return { bytes, contentType: TYPES[key.split(".").at(-1)!] ?? "application/octet-stream", size: bytes.byteLength };
    } finally { await file.close(); }
  } catch (error) {
    if (["ENOENT", "ELOOP"].includes((error as NodeJS.ErrnoException).code ?? "")) return null;
    throw error;
  }
}

export async function deleteLocalFile(key: string): Promise<void> {
  if (!fileKey.safeParse(key).success || key !== key.trim()) return;
  try { await unlink(join(await directory(), key)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
}
