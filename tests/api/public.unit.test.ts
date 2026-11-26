import type { Context } from "@netlify/functions";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ select: vi.fn(), getStore: vi.fn() }));
vi.mock("../../db/client", () => ({ db: { select: mocks.select, query: {siteSettings:{findFirst: async () => undefined}} } }));
vi.mock("@netlify/blobs", () => ({ getStore: mocks.getStore }));
beforeEach(() => vi.resetAllMocks());

const ctx = {} as Context;

describe("public endpoints without a database", () => {
  it("non-GET on content is 404 without querying the database", async () => {
    const { default: handler } = await import("../../netlify/functions/content");
    const response = await handler(new Request("https://site.test/api/content", { method: "POST" }), ctx);
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("not_found");
    expect(mocks.select).not.toHaveBeenCalled();
  });
  it("content returns the mapped profile with cache headers", async () => {
    const row = { id: 1, name: "Person", headline: "Engineer", intro: "Hello", about: "",
      location: null, email: "test@example.com", githubUrl: null, linkedinUrl: null,
      available: false, availabilityText: null, photoKey: null, photoAlt: null,
      cvKey: "a".repeat(32) + ".pdf", updatedAt: new Date("2026-01-01T00:00:00Z") };
    mocks.select.mockReturnValueOnce({ from: () => ({ limit: async () => [row] }) });
    for (let i = 0; i < 4; i++) mocks.select.mockReturnValueOnce({ from: async () => [] });
    const { default: handler } = await import("../../netlify/functions/content");
    const response = await handler(new Request("https://site.test/api/content"), ctx);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.profile.name).toBe("Person");
    expect(data.profile.cvUrl).toBe("/cv");
    expect(data.profile).not.toHaveProperty("cvKey");
    expect(data.profile).not.toHaveProperty("photoKey");
    expect(response.headers.get("Netlify-Cache-Tag")).toBe("content");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=0, must-revalidate");
    expect(response.headers.get("Netlify-CDN-Cache-Control")).toBe("public, max-age=60, stale-while-revalidate=300, durable");
  });
  it("files rejects ../ keys without touching the store", async () => {
    const { default: handler } = await import("../../netlify/functions/files");
    const response = await handler(new Request("https://site.test/api/files/..%2Fsecret"), ctx);
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("not_found");
    expect(mocks.getStore).not.toHaveBeenCalled();
  });
  it.each(["image/png", "application/pdf"])("files serves stored %s bytes with the contract headers", async (contentType) => {
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    const getWithMetadata = vi.fn(async () => ({ data: bytes, metadata: { contentType } }));
    mocks.getStore.mockReturnValue({ getWithMetadata });
    const { default: handler } = await import("../../netlify/functions/files");
    // The stored detected type wins over the extension.
    const key = "c".repeat(32) + ".jpg";
    const response = await handler(new Request(`https://site.test/api/files/${key}`), ctx);
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(getWithMetadata).toHaveBeenCalledWith(key, { type: "arrayBuffer" });
    expect(response.headers.get("Content-Type")).toBe(contentType);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Content-Security-Policy")).toBe("sandbox; default-src 'none'");
    expect(response.headers.get("Content-Disposition")).toBe(contentType === "application/pdf" ? 'inline; filename="cv.pdf"' : null);
  });
  it.each([{ rows: [] }, { rows: [{ cvKey: null }] }])("cv is 404 without a CV (%j)", async ({ rows }) => {
    mocks.select.mockReturnValue({ from: () => ({ limit: async () => rows }) });
    const { default: handler } = await import("../../netlify/functions/cv");
    const response = await handler(new Request("https://site.test/cv"), ctx);
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("not_found");
  });
  it("cv redirects to the stored file without caching", async () => {
    const key = "a".repeat(32) + ".pdf";
    mocks.select.mockReturnValue({ from: () => ({ limit: async () => [{ cvKey: key }] }) });
    const { default: handler } = await import("../../netlify/functions/cv");
    const response = await handler(new Request("https://site.test/cv"), ctx);
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(`/api/files/${key}`);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it.each([{ rows: [] }, { rows: [{ isVisible: false }] }])("project rejects missing or hidden rows (%j)", async ({ rows }) => {
    mocks.select.mockReturnValue({ from: () => ({ where: () => ({ limit: async () => rows }) }) });
    const { default: handler } = await import("../../netlify/functions/project");
    const response = await handler(new Request("https://site.test/api/projects/hidden"), ctx);
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("not_found");
  });
  it("project returns a visible detail with both cache tags", async () => {
    const row = { id: 1, slug: "visible", title: "Visible", summary: "Summary", body: "Body",
      role: null, category: "Web", technologies: [], liveUrl: null, githubUrl: null,
      imageKey: "b".repeat(32) + ".png", imageAlt: "Preview", featured: false, isVisible: true, sortOrder: 0 };
    mocks.select.mockReturnValue({ from: () => ({ where: () => ({ limit: async () => [row] }) }) });
    const { default: handler } = await import("../../netlify/functions/project");
    const response = await handler(new Request("https://site.test/api/projects/visible"), ctx);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ...Object.fromEntries(Object.entries(row).filter(([key]) => key !== "isVisible")),
      imageUrl: `/api/files/${row.imageKey}` });
    expect(response.headers.get("Netlify-Cache-Tag")).toBe("content,project:visible");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=0, must-revalidate");
    expect(response.headers.get("Netlify-CDN-Cache-Control")).toBe("public, max-age=60, stale-while-revalidate=300, durable");
  });
  it.each(["POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"])("all public functions reject %s before I/O", async (method) => {
    const handlers = [
      [await import("../../netlify/functions/content"), "/api/content"],
      [await import("../../netlify/functions/project"), "/api/projects/visible"],
      [await import("../../netlify/functions/files"), "/api/files/" + "a".repeat(32) + ".png"],
      [await import("../../netlify/functions/cv"), "/cv"],
      [await import("../../netlify/functions/api-not-found"), "/api/missing"],
    ] as const;
    for (const [module, path] of handlers) {
      const response = await module.default(new Request(`https://site.test${path}`, { method }), ctx);
      expect(response.status).toBe(404);
      expect((await response.json()).error.code).toBe("not_found");
    }
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.getStore).not.toHaveBeenCalled();
  });
  it.each(["..%2Fsecret", "%ZZ", "bad-key", "a/b", "..%5Csecret"])("files rejects invalid key %s before store access", async (key) => {
    const { default: handler } = await import("../../netlify/functions/files");
    expect((await handler(new Request(`https://site.test/api/files/${key}`), ctx)).status).toBe(404);
    expect(mocks.getStore).not.toHaveBeenCalled();
  });
  it("files returns 404 for a missing blob", async () => {
    mocks.getStore.mockReturnValue({ getWithMetadata: async () => null });
    const { default: handler } = await import("../../netlify/functions/files");
    const response = await handler(new Request("https://site.test/api/files/" + "a".repeat(32) + ".png"), ctx);
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("content returns 404 when the profile is missing", async () => {
    mocks.select.mockReturnValue({ from: () => ({ limit: async () => [] }) });
    const { default: handler } = await import("../../netlify/functions/content");
    const response = await handler(new Request("https://site.test/api/content"), ctx);
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("api-not-found returns json 404", async () => {
    const { default: handler } = await import("../../netlify/functions/api-not-found");
    const response = await handler(new Request("https://site.test/api/missing"), ctx);
    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(await response.json()).toEqual({ error: { code: "not_found", message: "Not found." } });
  });
});
