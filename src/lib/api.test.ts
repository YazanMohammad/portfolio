import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiError, ErrorCode, UploadResult } from "@shared/index";
import { ApiRequestError, apiGet, apiSend, apiUpload, fileUrl } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("files", () => {
  it.each(["image", "cv"] as const)("apiUpload posts FormData with field file and no content-type header (%s)", async (kind) => {
    const file = new File(["file contents"], "upload.bin", { type: "application/octet-stream" });
    const result: UploadResult = { key: "opaque-key", url: "/api/files/opaque-key", contentType: file.type, size: file.size };
    const fetch = vi.fn().mockResolvedValue(Response.json(result, { status: 201 }));
    vi.stubGlobal("fetch", fetch);

    await expect(apiUpload(kind, file)).resolves.toEqual(result);
    expect(fetch).toHaveBeenCalledWith(`/api/admin/files?kind=${kind}`, expect.objectContaining({
      method: "POST", credentials: "same-origin", body: expect.any(FormData),
    }));
    const options = fetch.mock.calls[0][1] as RequestInit;
    const form = options.body as FormData;
    expect([...form.keys()]).toEqual(["file"]);
    const uploaded = form.get("file") as File;
    expect(uploaded.name).toBe(file.name);
    expect(await uploaded.text()).toBe(await file.text());
    expect(new Headers(options.headers).has("Content-Type")).toBe(false);
  });

  it.each([
    ["a b", "/api/files/a%20b"],
    ["a/b?x#é", "/api/files/a%2Fb%3Fx%23%C3%A9"],
  ])("fileUrl encodes key %s", (key, expected) => {
    expect(fileUrl(key)).toBe(expected);
  });
});

describe("API errors", () => {
  it("network error maps to status 0", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const error = await apiGet("/api/content").catch((error: unknown) => error);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ status: 0, code: "server" });
  });

  it("429 with Retry-After sets retryAfter", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      error: { code: "rate_limited", message: "Try later" },
    }, { status: 429, headers: { "Retry-After": "900" } })));
    await expect(apiGet("/api/content")).rejects.toMatchObject({
      status: 429, code: "rate_limited", retryAfter: 900,
    });
  });

  it("429 without Retry-After leaves retryAfter undefined", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 429 })));
    const error = await apiGet("/api/content").catch((error: unknown) => error);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toHaveProperty("retryAfter", undefined);
  });

  it.each(["0", "60"])("reads Retry-After %s on non-JSON errors", async (value) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, {
      status: 429, headers: { "Retry-After": value },
    })));
    await expect(apiGet("/api/content")).rejects.toMatchObject({ retryAfter: Number(value) });
  });

  it.each(["later", "1.5", "60seconds", "-1", "Wed, 25 Nov 2026 12:00:00 GMT", "999999999999999999999999"])(
    "ignores unparseable Retry-After %s", async (value) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, {
        status: 429, headers: { "Retry-After": value },
      })));
      const error = await apiGet("/api/content").catch((error: unknown) => error);
      expect(error).toHaveProperty("retryAfter", undefined);
    },
  );

  it("error body becomes ApiRequestError with code and fields", async () => {
    const body: ApiError = { error: {
      code: "validation", message: "Invalid input", fields: { "bullets.2": "Too long" },
    } };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body, { status: 400 })));

    const error = await apiSend("PUT", "/api/admin/experience/1", {}).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({
      name: "ApiRequestError", message: "Invalid input", status: 400,
      code: "validation", fields: { "bullets.2": "Too long" },
    });
  });

  it.each<[number, ErrorCode]>([
    [413, "too_large"], [401, "unauthorized"], [403, "forbidden_origin"],
    [404, "not_found"], [415, "unsupported_type"], [429, "rate_limited"], [502, "server"],
  ])("non-json %s maps to %s", async (status, code) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>proxy error</html>", { status })));
    const error = await apiGet("/api/content").catch((error: unknown) => error);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ status, code });
  });

  it.each(["", "{broken", "null", '{"error":{"code":"invented","message":"bad"}}', '{"error":{"code":"validation","message":"bad","fields":{"x":2}}}'])(
    "maps empty, malformed, or non-ApiError bodies to status fallback: %s", async (body) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status: 413 })));
      await expect(apiGet("/api/content")).rejects.toMatchObject({ status: 413, code: "too_large" });
    },
  );
});

describe("apiSend", () => {
  it.each(["POST", "PUT", "PATCH", "DELETE"] as const)("sends json body and %s method", async (method) => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetch);

    await expect(apiSend<{ ok: boolean }>(method, "/api/admin/projects", { title: "Portfolio" })).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith("/api/admin/projects", {
      method,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Portfolio" }),
    });
  });

  it("204 resolves undefined without sending an absent body", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);

    await expect(apiSend<void>("DELETE", "/api/admin/projects/1")).resolves.toBeUndefined();
    const options = fetch.mock.calls[0][1] as RequestInit;
    expect(options.credentials).toBe("same-origin");
    expect(options.body).toBeUndefined();
    expect(new Headers(options.headers).has("Content-Type")).toBe(false);
  });
});

describe("apiGet", () => {
  it("returns parsed json with same-origin credentials", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ name: "Yazan" }));
    vi.stubGlobal("fetch", fetch);

    await expect(apiGet<{ name: string }>("/api/content")).resolves.toEqual({ name: "Yazan" });
    expect(fetch).toHaveBeenCalledWith("/api/content", expect.objectContaining({
      credentials: "same-origin",
      method: "GET",
    }));
  });
});
