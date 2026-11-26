import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CV_MAX_BYTES, IMAGE_MAX_BYTES, fileKey } from "../shared/index";
import { HttpError } from "./http";
import { detectFileType, validateUpload } from "./uploads";
import { deleteFile, getFile, newFileKey, saveFile } from "./blobs";

const store = vi.hoisted(() => ({
  map: new Map<string, { data: ArrayBuffer; metadata: Record<string, unknown> }>(),
  getStore: vi.fn(),
  failDelete: false,
}));

vi.mock("@netlify/blobs", () => {
  const api = {
    set: vi.fn(async (key: string, data: ArrayBuffer | Uint8Array, opts?: { metadata?: Record<string, unknown> }) => {
      const copy = data instanceof Uint8Array ? data.slice().buffer : data.slice(0);
      store.map.set(key, { data: copy, metadata: opts?.metadata ?? {} });
      return { modified: true };
    }),
    getWithMetadata: vi.fn(async (key: string) => {
      const hit = store.map.get(key);
      return hit ? { data: hit.data, metadata: hit.metadata, etag: "x" } : null;
    }),
    delete: vi.fn(async (key: string) => {
      if (store.failDelete) throw new Error("secret token leak");
      store.map.delete(key);
    }),
  };
  store.getStore.mockImplementation(() => api);
  return { getStore: store.getStore };
});

const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00];
const WEBP = [...Buffer.from("RIFF"), 0x10, 0x00, 0x00, 0x00, ...Buffer.from("WEBPVP8 ")];
const PDF = [...Buffer.from("%PDF-1.7\n")];
const bytes = (list: number[]) => new Uint8Array(list);
const file = (list: number[], name = "x.bin", type = "") => new File([bytes(list)], name, { type });

async function failure(promise: Promise<unknown>): Promise<HttpError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(HttpError);
    return error as HttpError;
  }
  throw new Error("expected a failure");
}

beforeEach(() => {
  store.map.clear();
  store.failDelete = false;
  store.getStore.mockClear();
});
afterEach(() => vi.restoreAllMocks());

describe("detectFileType", () => {
  it("detects jpeg png webp pdf", () => {
    expect(detectFileType(bytes(JPEG))).toEqual({ contentType: "image/jpeg", ext: "jpg" });
    expect(detectFileType(bytes(PNG))).toEqual({ contentType: "image/png", ext: "png" });
    expect(detectFileType(bytes(WEBP))).toEqual({ contentType: "image/webp", ext: "webp" });
    expect(detectFileType(bytes(PDF))).toEqual({ contentType: "application/pdf", ext: "pdf" });
  });
  it("rejects svg", () => {
    expect(detectFileType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
  });
  it("rejects html", () => {
    expect(detectFileType(new TextEncoder().encode("<!doctype html><html><script>x</script></html>"))).toBeNull();
  });
  it("rejects exe (MZ)", () => {
    expect(detectFileType(bytes([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]))).toBeNull();
  });
  it("returns null for short or partial signatures without throwing", () => {
    for (const list of [[], [0xff, 0xd8], PNG.slice(0, 7), [...Buffer.from("RIFF")], [...Buffer.from("RIFF0000WEB")], [...Buffer.from("%PDF")]]) {
      expect(detectFileType(bytes(list))).toBeNull();
    }
    expect(detectFileType(bytes([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WAVE")]))).toBeNull();
    expect(detectFileType(bytes([0x00, ...JPEG]))).toBeNull();
  });
});

describe("validateUpload", () => {
  it("rejects a PDF renamed .png when kind is image", async () => {
    const error = await failure(validateUpload("image", file(PDF, "a.png", "image/png")));
    expect(error.status).toBe(415);
    expect(error.code).toBe("unsupported_type");
    expect(error.message).not.toContain("a.png");
  });
  it("accepts a PNG named .pdf as image", async () => {
    const result = await validateUpload("image", file(PNG, "a.pdf", "application/pdf"));
    expect(result.contentType).toBe("image/png");
    expect(result.ext).toBe("png");
    expect(Array.from(result.bytes)).toEqual(PNG);
  });
  it("image over 4 MB is 413", async () => {
    const big = new File([new Uint8Array(IMAGE_MAX_BYTES + 1)], "big.png");
    const error = await failure(validateUpload("image", big));
    expect(error.status).toBe(413);
    expect(error.code).toBe("too_large");
    expect(error.message).toBe("That file is too large. The limit is 4 MB.");
  });
  it("cv over 4 MB is 413", async () => {
    const big = new File([bytes(PDF), new Uint8Array(CV_MAX_BYTES)], "cv.pdf");
    const error = await failure(validateUpload("cv", big));
    expect(error.status).toBe(413);
    expect(error.code).toBe("too_large");
  });
  it("accepts a file of exactly the limit", async () => {
    const data = new Uint8Array(CV_MAX_BYTES);
    data.set(PDF);
    await expect(validateUpload("cv", new File([data], "cv.pdf"))).resolves.toMatchObject({ contentType: "application/pdf" });
  });
  it("rejects on file.size before reading the bytes", async () => {
    const fake = new File([bytes(PNG)], "x.png");
    Object.defineProperty(fake, "size", { value: IMAGE_MAX_BYTES + 1 });
    const read = vi.spyOn(fake, "arrayBuffer");
    expect((await failure(validateUpload("image", fake))).status).toBe(413);
    expect(read).not.toHaveBeenCalled();
  });
  it("re-checks the real byte length when file.size lies", async () => {
    const data = new Uint8Array(IMAGE_MAX_BYTES + 1);
    data.set(PNG);
    const fake = new File([data], "x.png");
    Object.defineProperty(fake, "size", { value: 10 });
    expect((await failure(validateUpload("image", fake))).status).toBe(413);
  });
  it("cv kind refuses a JPEG", async () => {
    const error = await failure(validateUpload("cv", file(JPEG, "cv.pdf", "application/pdf")));
    expect(error.status).toBe(415);
    expect(error.message).toBe("That file type is not allowed.");
  });
  it("image kind refuses unknown bytes", async () => {
    expect((await failure(validateUpload("image", file([...Buffer.from("<svg/>")], "a.png")))).status).toBe(415);
  });
  it("empty file is 400", async () => {
    const error = await failure(validateUpload("image", file([], "a.png")));
    expect(error.status).toBe(400);
    expect(error.code).toBe("validation");
    expect(error.fields?.file).toBeTruthy();
  });
  it("missing file is 400 with fields.file", async () => {
    for (const value of [undefined, null, "a string", { size: 5, arrayBuffer: async () => new ArrayBuffer(5) }]) {
      const error = await failure(validateUpload("image", value));
      expect(error.status).toBe(400);
      expect(error.fields).toEqual({ file: "Choose a file." });
    }
  });
});

describe("blobs", () => {
  it("file key matches the contract regex and differs each call", () => {
    const keys = new Set<string>();
    for (const ext of ["jpg", "png", "webp", "pdf"]) {
      const key = newFileKey(ext);
      expect(fileKey.safeParse(key).success).toBe(true);
      expect(key.endsWith(`.${ext}`)).toBe(true);
      keys.add(key);
    }
    expect(keys.size).toBe(4);
    expect(newFileKey("png")).not.toBe(newFileKey("png"));
  });
  it("newFileKey refuses an unknown extension", () => {
    expect(() => newFileKey("svg")).toThrow();
    expect(() => newFileKey("../x")).toThrow();
  });
  it("getFile returns null for ../etc/passwd without touching the store", async () => {
    for (const key of ["../etc/passwd", `../${"a".repeat(32)}.png`, `${"a".repeat(32)}.svg`, "", `${"A".repeat(32)}.png`, ` ${"a".repeat(32)}.png`, `${"a".repeat(32)}.png\n`]) {
      await expect(getFile(key)).resolves.toBeNull();
    }
    expect(store.getStore).not.toHaveBeenCalled();
  });
  it("saveFile stores exactly the view bytes of a Buffer subarray", async () => {
    const view = Buffer.from([9, 1, 2, 3, 9, 9]).subarray(1, 4);
    const { key } = await saveFile(view, "png", "image/png");
    const stored = store.map.get(key)!.data;
    expect(stored.byteLength).toBe(3);
    expect([...new Uint8Array(stored)]).toEqual([1, 2, 3]);
  });

  it("saveFile stores exactly the bytes of a pooled small Buffer", async () => {
    const { key } = await saveFile(Buffer.from([1, 2, 3]), "png", "image/png");
    const stored = store.map.get(key)!.data;
    expect(stored.byteLength).toBe(3);
    expect([...new Uint8Array(stored)]).toEqual([1, 2, 3]);
  });

  it("saveFile returns UploadResult with size and contentType", async () => {
    const result = await saveFile(bytes(PNG), "png", "image/png");
    expect(fileKey.safeParse(result.key).success).toBe(true);
    expect(result).toEqual({ key: result.key, url: `/api/files/${result.key}`, contentType: "image/png", size: PNG.length });
    expect(store.getStore).toHaveBeenCalledWith("files");
    expect(store.map.get(result.key)?.metadata).toEqual({ contentType: "image/png" });
    const back = await getFile(result.key);
    expect(back?.contentType).toBe("image/png");
    expect(Array.from(new Uint8Array(back!.bytes))).toEqual(PNG);
  });
  it("getFile returns null for a missing key and octet-stream without contentType", async () => {
    const key = `${"b".repeat(32)}.pdf`;
    await expect(getFile(key)).resolves.toBeNull();
    store.map.set(key, { data: bytes(PDF).buffer, metadata: {} });
    await expect(getFile(key)).resolves.toMatchObject({ contentType: "application/octet-stream" });
    store.map.set(key, { data: bytes(PDF).buffer, metadata: { contentType: 42 } });
    await expect(getFile(key)).resolves.toMatchObject({ contentType: "application/octet-stream" });
  });
  it("uses site ID and token only when both are set", async () => {
    vi.stubEnv("BLOBS_SITE_ID", "site");
    vi.stubEnv("BLOBS_TOKEN", "tok");
    try {
      await saveFile(bytes(PNG), "png", "image/png");
      expect(store.getStore).toHaveBeenLastCalledWith({ name: "files", siteID: "site", token: "tok" });
      vi.stubEnv("BLOBS_TOKEN", "");
      await saveFile(bytes(PNG), "png", "image/png");
      expect(store.getStore).toHaveBeenLastCalledWith("files");
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it("deleteFile(null) does nothing", async () => {
    await deleteFile(null);
    await deleteFile(undefined);
    await deleteFile("");
    expect(store.getStore).not.toHaveBeenCalled();
  });
  it("deleteFile removes a stored file", async () => {
    const { key } = await saveFile(bytes(PDF), "pdf", "application/pdf");
    await deleteFile(key);
    expect(store.map.has(key)).toBe(false);
  });
  it("deleteFile swallows store errors", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    store.failDelete = true;
    const key = `${"c".repeat(32)}.png`;
    await expect(deleteFile(key)).resolves.toBeUndefined();
    expect(log).toHaveBeenCalled();
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).not.toContain("secret token leak");
    expect(logged).not.toContain(key);
  });
});
