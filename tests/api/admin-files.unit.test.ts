import type { Context } from "@netlify/functions";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  store: new Map<string, { data: ArrayBuffer; metadata: Record<string, unknown> }>(),
  set: vi.fn(), auth: vi.fn(), db: vi.fn(), touch: vi.fn(), purge: vi.fn(),
}));
vi.mock("@netlify/blobs", () => ({
  getStore: () => ({
    set: async (key: string, data: ArrayBuffer, options?: { metadata?: Record<string, unknown> }) => {
      mocks.set(key);
      mocks.store.set(key, { data: data.slice(0), metadata: options?.metadata ?? {} });
    },
  }),
}));
vi.mock("../../server/sessions", () => ({ requireAdmin: mocks.auth }));
// Any profile or project work would go through these. The upload must touch none of them.
vi.mock("../../db/client", () => ({ db: new Proxy({}, { get: (_t, prop) => { mocks.db(prop); return mocks.db; } }) }));
vi.mock("../../server/last-saved", () => ({ touchLastSaved: mocks.touch }));
vi.mock("../../server/cache", () => ({ purgeContent: mocks.purge }));

import handler, { config } from "../../netlify/functions/admin-files";
import { fail } from "../../server/http";

const SITE = "https://site.test";
const MB4 = 4 * 1024 * 1024;
const ctx = {} as Context;
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff, 0xe0];
const PDF = [...Buffer.from("%PDF-1.7\n")];
const bytes = (head: number[], size = 64) => { const b = new Uint8Array(size); b.set(head); return b; };
const file = (data: Uint8Array<ArrayBuffer>, name: string, type: string) => new File([data], name, { type });

function form(f?: File, field = "file"): FormData {
  const data = new FormData();
  if (f) data.append(field, f);
  else data.append("other", "x");
  return data;
}
function req(opts: { kind?: string | null; body?: BodyInit; method?: string; origin?: string; headers?: Record<string, string>; path?: string } = {}) {
  const kind = opts.kind === undefined ? "image" : opts.kind;
  const query = kind === null ? "" : `?kind=${encodeURIComponent(kind)}`;
  return new Request(SITE + (opts.path ?? "/api/admin/files") + query, {
    method: opts.method ?? "POST",
    headers: { Origin: opts.origin ?? SITE, ...opts.headers },
    body: opts.body,
    ...(opts.body instanceof ReadableStream ? { duplex: "half" } : {}),
  } as RequestInit);
}
const upload = (f: File | undefined, kind: string | null = "image") => handler(req({ kind, body: form(f) }), ctx);
async function errorOf(response: Response) { return (await response.json()).error as { code: string; message: string }; }

// A multipart body as raw bytes, so tests can set or remove Content-Length themselves.
async function rawForm(f: File) {
  const encoded = new Response(form(f));
  return { contentType: encoded.headers.get("Content-Type")!, data: new Uint8Array(await encoded.arrayBuffer()) };
}
function streamOf(data: Uint8Array, chunk = 64 * 1024, onPull?: (sent: number) => void) {
  let sent = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= data.byteLength) { controller.close(); return; }
      controller.enqueue(data.subarray(sent, sent + chunk)); sent += chunk; onPull?.(sent);
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks(); mocks.store.clear();
  vi.stubEnv("SITE_ORIGIN", SITE);
  mocks.auth.mockResolvedValue({ renewedCookie: null });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("admin file upload", () => {
  it("uses the contract path", () => { expect(config.path).toBe("/api/admin/files"); });

  it("valid PNG as image is 201 with key, url, contentType, size and the bytes in the store", async () => {
    const data = bytes(PNG, 100);
    const response = await upload(file(data, "photo.png", "image/png"));
    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.json();
    expect(body.key).toMatch(/^[a-f0-9]{32}\.png$/);
    expect(body).toEqual({ key: body.key, url: `/api/files/${body.key}`, contentType: "image/png", size: 100 });
    const stored = mocks.store.get(body.key)!;
    expect(new Uint8Array(stored.data)).toEqual(data);
    expect(stored.metadata).toEqual({ contentType: "image/png" });
  });

  it("valid PDF as cv is 201", async () => {
    const response = await upload(file(bytes(PDF), "cv.pdf", "application/pdf"), "cv");
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.key).toMatch(/^[a-f0-9]{32}\.pdf$/);
    expect(body.contentType).toBe("application/pdf");
  });

  it("JPEG and WebP as image are 201", async () => {
    const webp = bytes([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP")]);
    expect((await upload(file(bytes(JPEG), "a.jpg", "image/jpeg"))).status).toBe(201);
    expect((await upload(file(webp, "a.webp", "image/webp"))).status).toBe(201);
  });

  it("PDF bytes named photo.png as cv is 201 (name ignored)", async () => {
    const response = await upload(file(bytes(PDF), "photo.png", "image/png"), "cv");
    expect(response.status).toBe(201);
    expect((await response.json()).key).toMatch(/\.pdf$/);
  });

  it.each([
    ["PDF as image", () => file(bytes(PDF), "cv.pdf", "application/pdf"), "image"],
    ["JPEG as cv", () => file(bytes(JPEG), "cv.pdf", "application/pdf"), "cv"],
    ["SVG named .png", () => file(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), "x.png", "image/png"), "image"],
    ["declared image/png with HTML bytes", () => file(new TextEncoder().encode("<!doctype html><script>alert(1)</script>"), "x.png", "image/png"), "image"],
  ])("%s is 415 and stores nothing", async (_name, make, kind) => {
    const response = await upload(make(), kind);
    expect(response.status).toBe(415);
    expect((await errorOf(response)).code).toBe("unsupported_type");
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("empty file is 400", async () => {
    const response = await upload(file(new Uint8Array(0), "a.png", "image/png"));
    expect(response.status).toBe(400);
    expect((await errorOf(response)).code).toBe("validation");
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("no file field is 400", async () => {
    expect((await upload(undefined)).status).toBe(400);
    // A text field named file is not a file either.
    const data = new FormData(); data.append("file", "not a file");
    expect((await handler(req({ body: data }), ctx)).status).toBe(400);
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("non-multipart body is 400", async () => {
    const json = await handler(req({ body: JSON.stringify({ file: "x" }), headers: { "Content-Type": "application/json" } }), ctx);
    expect(json.status).toBe(400);
    expect((await errorOf(json)).code).toBe("validation");
    const none = await handler(req({}), ctx);
    expect(none.status).toBe(400);
  });

  it("broken multipart body is 400", async () => {
    const response = await handler(req({ body: "garbage", headers: { "Content-Type": "multipart/form-data; boundary=abc" } }), ctx);
    expect(response.status).toBe(400);
    expect((await errorOf(response)).code).toBe("validation");
  });

  it.each([["image", PNG], ["cv", PDF]])("%s over 4 MB is 413", async (kind, head) => {
    const response = await upload(file(bytes(head, MB4 + 1), "big", "application/octet-stream"), kind);
    expect(response.status).toBe(413);
    expect((await errorOf(response)).code).toBe("too_large");
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("exactly 4 MB is accepted", async () => {
    expect((await upload(file(bytes(PNG, MB4), "a.png", "image/png"))).status).toBe(201);
  });

  it("Content-Length over the limit is 413 before the body is read", async () => {
    const request = req({ body: form(file(bytes(PNG), "a.png", "image/png")) });
    const headers = new Headers(request.headers); headers.set("Content-Length", String(MB4 + 64 * 1024 + 1));
    const big = new Request(request, { headers });
    const formData = vi.spyOn(big, "formData"); const arrayBuffer = vi.spyOn(big, "arrayBuffer");
    const response = await handler(big, ctx);
    expect(response.status).toBe(413);
    expect((await errorOf(response)).code).toBe("too_large");
    expect(formData).not.toHaveBeenCalled(); expect(arrayBuffer).not.toHaveBeenCalled();
    expect(big.bodyUsed).toBe(false);
  });

  it.each(["abc", "-1", "1e9", "12 34", "0x10", ""])("malformed Content-Length %j is 400 without reading the body", async value => {
    const raw = await rawForm(file(bytes(PNG), "a.png", "image/png"));
    const request = req({ body: streamOf(raw.data), headers: { "Content-Type": raw.contentType, "Content-Length": value } });
    expect(request.headers.get("Content-Length")).toBe(value);
    const response = await handler(request, ctx);
    expect(response.status).toBe(400);
    expect(request.bodyUsed).toBe(false);
  });

  it("missing Content-Length still works for a small body (bounded read)", async () => {
    const raw = await rawForm(file(bytes(PNG), "a.png", "image/png"));
    const request = req({ body: streamOf(raw.data), headers: { "Content-Type": raw.contentType } });
    expect(request.headers.get("Content-Length")).toBeNull();
    expect((await handler(request, ctx)).status).toBe(201);
  });

  it("missing Content-Length with a huge body is 413 and stops reading early", async () => {
    const raw = await rawForm(file(bytes(PNG, 20 * 1024 * 1024), "a.png", "image/png"));
    let sent = 0;
    const request = req({ body: streamOf(raw.data, 64 * 1024, n => { sent = n; }), headers: { "Content-Type": raw.contentType } });
    const response = await handler(request, ctx);
    expect(response.status).toBe(413);
    expect(sent).toBeLessThan(MB4 + 64 * 1024 + 4 * 64 * 1024);
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("Content-Length that lies low cannot sneak a huge body through", async () => {
    const raw = await rawForm(file(bytes(PNG, 20 * 1024 * 1024), "a.png", "image/png"));
    let sent = 0;
    const request = req({ body: streamOf(raw.data, 64 * 1024, n => { sent = n; }), headers: { "Content-Type": raw.contentType, "Content-Length": "100" } });
    expect(request.headers.get("Content-Length")).toBe("100");
    const response = await handler(request, ctx);
    expect(response.status).toBe(400);
    expect(sent).toBeLessThan(MB4 + 64 * 1024 + 4 * 64 * 1024);
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("kind missing, empty, repeated or unknown is 400 before the body is read", async () => {
    for (const kind of [null, "", "pdf", "IMAGE", "image&kind=cv"]) {
      const request = req({ kind, body: form(file(bytes(PNG), "a.png", "image/png")) });
      const response = await handler(new Request(request.url.replace("%26kind%3D", "&kind="), request), ctx);
      expect(response.status, String(kind)).toBe(400);
      expect((await errorOf(response)).code).toBe("validation");
    }
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("no session is 401 and nothing is stored", async () => {
    mocks.auth.mockRejectedValueOnce(fail("unauthorized", "Sign in."));
    const response = await upload(file(bytes(PNG), "a.png", "image/png"));
    expect(response.status).toBe(401);
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("foreign origin is 403 before authentication and body reading", async () => {
    const request = req({ origin: "https://foreign.test", body: form(file(bytes(PNG), "a.png", "image/png")) });
    const formData = vi.spyOn(request, "formData");
    const response = await handler(request, ctx);
    expect(response.status).toBe(403);
    expect(mocks.auth).not.toHaveBeenCalled(); expect(formData).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("upload does not change the profile or projects", async () => {
    expect((await upload(file(bytes(PDF), "cv.pdf", "application/pdf"), "cv")).status).toBe(201);
    expect((await upload(file(bytes(PNG), "a.png", "image/png"))).status).toBe(201);
    expect(mocks.db).not.toHaveBeenCalled();
    expect(mocks.touch).not.toHaveBeenCalled();
    expect(mocks.purge).not.toHaveBeenCalled();
  });

  it("renewed session cookie is added to the 201", async () => {
    mocks.auth.mockResolvedValueOnce({ renewedCookie: "renewed=1" });
    const response = await upload(file(bytes(PNG), "a.png", "image/png"));
    expect(response.status).toBe(201);
    expect(response.headers.get("Set-Cookie")).toBe("renewed=1");
  });

  it("a store failure is a plain 500 with no internals", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.set.mockImplementationOnce(() => { throw new Error("blob token secret"); });
    const response = await upload(file(bytes(PNG), "a.png", "image/png"));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("secret");
  });

  it.each(["GET", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"])("%s is 404", async method => {
    const response = await handler(req({ method }), ctx);
    expect(response.status).toBe(404);
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("wrong path is 404", async () => {
    expect((await handler(req({ path: "/api/admin/files/extra", body: form(file(bytes(PNG), "a.png", "image/png")) }), ctx)).status).toBe(404);
  });
});
