import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readdir, readFile, rm, stat, symlink, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { saveFile, getFile, deleteFile } from "./blobs";
import { initializeFilesDirectory } from "./filesystem";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(process.env.TMPDIR ?? tmpdir(), "portfolio-files-"));
  vi.stubEnv("FILES_DIR", join(root, "private", "files"));
});
afterEach(async () => { vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }); });

describe("filesystem file store", () => {
  it("initializes once, sweeps only stale temporary files and fails fast on invalid configuration", async () => {
    await mkdir(process.env.FILES_DIR!, { recursive: true });
    const old = join(process.env.FILES_DIR!, `.${"a".repeat(32)}.tmp`);
    const fresh = join(process.env.FILES_DIR!, `.${"b".repeat(32)}.tmp`);
    await writeFile(old, "old"); await utimes(old, new Date(0), new Date(0));
    await writeFile(fresh, "fresh");
    await initializeFilesDirectory();
    expect(await readdir(process.env.FILES_DIR!)).toEqual([`.${"b".repeat(32)}.tmp`]);
    await rm(process.env.FILES_DIR!, { recursive: true });
    // A read uses the initialized location, not mkdir/chmod on every request.
    expect(await getFile("c".repeat(32) + ".png")).toBeNull();
    expect(await readdir(join(root, "private"))).toEqual([]);
    vi.stubEnv("FILES_DIR", "relative/path");
    await expect(initializeFilesDirectory()).rejects.toThrow("absolute");
  });
  it("round-trips only the supplied view bytes with type and size, and deletes", async () => {
    const input = new Uint8Array([99, 1, 2, 3, 88]).subarray(1, 4);
    const saved = await saveFile(input, "png", "image/png");
    expect(saved).toMatchObject({ contentType: "image/png", size: 3, url: `/api/files/${saved.key}` });
    const file = await getFile(saved.key);
    expect([...new Uint8Array(file!.bytes)]).toEqual([1, 2, 3]);
    expect(file).toMatchObject({ contentType: "image/png", size: 3 });
    expect(await readdir(process.env.FILES_DIR!)).toEqual([saved.key]);
    await deleteFile(saved.key);
    expect(await getFile(saved.key)).toBeNull();
  });
  it.each(["../outside.png", "..\\outside.png", "/etc/passwd", "%2e%2e%2f.env", "a".repeat(32)+".png/../x", " "+"a".repeat(32)+".png", "a".repeat(32)+".svg"])("rejects traversal or invalid key %s before I/O", async key => {
    await expect(getFile(key)).resolves.toBeNull();
    await deleteFile(key);
    expect(await readdir(root)).toEqual([]);
  });
  it("uses private modes and leaves no temporary files after parallel writes", async () => {
    const results = await Promise.all(Array.from({ length: 12 }, () => saveFile(new Uint8Array([1]), "pdf", "application/pdf")));
    expect((await readdir(process.env.FILES_DIR!)).sort()).toEqual(results.map(f => f.key).sort());
    if (process.platform !== "win32") {
      expect((await stat(process.env.FILES_DIR!)).mode & 0o777).toBe(0o700);
      for (const f of results) expect((await stat(join(process.env.FILES_DIR!, f.key))).mode & 0o777).toBe(0o600);
    }
  });
  it("does not trust content types supplied by a caller", async () => {
    await expect(saveFile(new Uint8Array([1]), "png", "text/html")).rejects.toThrow();
  });
  it("seed uploader uses FILES_DIR without Netlify credentials", async () => {
    vi.stubEnv("BLOBS_SITE_ID", ""); vi.stubEnv("BLOBS_TOKEN", ""); vi.stubEnv("NETLIFY", "");
    const { defaultUploadFile } = await import("../db/seed");
    const saved = await defaultUploadFile(new Uint8Array([1]), "png", "image/png");
    expect(await getFile(saved.key)).toMatchObject({ contentType: "image/png" });
  });
  it.skipIf(process.platform === "win32")("refuses symlinks without reading or deleting their targets", async () => {
    const saved = await saveFile(new Uint8Array([1]), "png", "image/png");
    const path = join(process.env.FILES_DIR!, saved.key);
    const outside = join(root, "outside");
    await writeFile(outside, "secret"); await rm(path); await symlink(outside, path);
    expect(await getFile(saved.key)).toBeNull();
    await deleteFile(saved.key);
    expect(await readFile(outside, "utf8")).toBe("secret");
  });
});
