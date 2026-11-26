import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadCvBytes, DEFAULT_CV_PATH } from "./seed-cv";
import { CV_MAX_BYTES } from "../shared/index";

const PDF = new TextEncoder().encode("%PDF-1.4\nCV fixture");
let dir: string;
const fallback = vi.fn(async () => new Response(PDF));
beforeEach(async () => { dir = await mkdtemp(join(process.env.TMPDIR || tmpdir(), "portfolio-cv-")); fallback.mockClear(); });
afterEach(async () => { vi.unstubAllEnvs(); await rm(dir, {recursive:true,force:true}); });
describe("local CV seed source", () => {
  it("uses the configured absolute PDF without any URL fetch", async () => {
    const path = join(dir,"cv.pdf"); await writeFile(path,PDF); vi.stubEnv("CV_PATH",path);
    expect(await loadCvBytes({fetchCv:fallback})).toEqual(PDF); expect(fallback).not.toHaveBeenCalled();
  });
  it("defaults to the CV master path when present", async () => {
    expect(DEFAULT_CV_PATH).toBe("C:/Projects/Personal/CV maker/master/Yazan_Mohammad_CV.pdf");
    const path = join(dir,"default.pdf"); await writeFile(path,PDF);
    expect(await loadCvBytes({cvPath:null,defaultCvPath:path,fetchCv:fallback})).toEqual(PDF); expect(fallback).not.toHaveBeenCalled();
  });
  it("falls back to the old URL only when the default file is absent", async () => {
    expect(await loadCvBytes({cvPath:null,defaultCvPath:join(dir,"absent.pdf"),fetchCv:fallback})).toEqual(PDF);
    expect(fallback).toHaveBeenCalledOnce();
  });
  it("does not hide a broken explicit path by fetching the old CV", async () => {
    await expect(loadCvBytes({cvPath:join(dir,"absent.pdf"),fetchCv:fallback})).rejects.toThrow(); expect(fallback).not.toHaveBeenCalled();
  });
  it("requires CV_PATH to be absolute", async () => {
    await expect(loadCvBytes({cvPath:"relative.pdf",fetchCv:fallback})).rejects.toThrow(/absolute/); expect(fallback).not.toHaveBeenCalled();
  });
  it("rejects non-PDF local bytes despite the extension", async () => {
    const path=join(dir,"bad.pdf");await writeFile(path,"<html>not PDF</html>");
    await expect(loadCvBytes({cvPath:path,fetchCv:fallback})).rejects.toThrow(/PDF/); expect(fallback).not.toHaveBeenCalled();
  });
  it("rejects an oversized local PDF", async () => {
    const path=join(dir,"large.pdf");const bytes=new Uint8Array(CV_MAX_BYTES+1);bytes.set(PDF);await writeFile(path,bytes);
    await expect(loadCvBytes({cvPath:path,fetchCv:fallback})).rejects.toThrow(/4 MB/); expect(fallback).not.toHaveBeenCalled();
  });
  it("accepts exactly the cap", async () => {
    const path=join(dir,"cap.pdf");const bytes=new Uint8Array(CV_MAX_BYTES);bytes.set(PDF);await writeFile(path,bytes);
    expect((await loadCvBytes({cvPath:path})).byteLength).toBe(CV_MAX_BYTES);
  });
  it("validates remote status, bytes and size too", async () => {
    const options={cvPath:null,defaultCvPath:null};
    await expect(loadCvBytes({...options,fetchCv:vi.fn(async()=>new Response("bad",{status:404}))})).rejects.toThrow(/404/);
    await expect(loadCvBytes({...options,fetchCv:vi.fn(async()=>new Response("<html>"))})).rejects.toThrow(/PDF/);
    await expect(loadCvBytes({...options,fetchCv:vi.fn(async()=>new Response(new Uint8Array(CV_MAX_BYTES+1)))})).rejects.toThrow(/4 MB/);
  });
});
