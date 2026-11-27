import { purgeCache } from "@netlify/functions";
import { afterEach, expect, it, vi } from "vitest";
import { publicCacheHeaders, purgeContent } from "./cache";
vi.mock("@netlify/functions", () => ({ purgeCache: vi.fn().mockResolvedValue(undefined) }));
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllEnvs(); });
it("does not call Netlify cache APIs from the standalone runtime", async () => {
  vi.stubEnv("PORTFOLIO_RUNTIME", "vps");
  await purgeContent();
  expect(purgeCache).not.toHaveBeenCalled();
  const headers = publicCacheHeaders(["content"]);
  expect(headers.get("Netlify-Cache-Tag")).toBeNull();
  expect(headers.get("Netlify-CDN-Cache-Control")).toBeNull();
});
it("purgeContent passes content and project tags", async () => {
  await purgeContent({ slugs: ["old-slug", "new-slug"] });
  expect(purgeCache).toHaveBeenCalledWith({ tags: ["content", "project:old-slug", "project:new-slug"] });
  await purgeContent();
  expect(purgeCache).toHaveBeenLastCalledWith({ tags: ["content"] });
});
it("purgeContent swallows a rejected purge", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(purgeCache).mockRejectedValueOnce(new Error("secret token"));
  await expect(purgeContent()).resolves.toBeUndefined();
  expect(log).toHaveBeenCalled();
  expect(JSON.stringify(log.mock.calls)).not.toContain("secret token");
});
it("publicCacheHeaders has tag and swr values", () => {
  const headers = publicCacheHeaders(["content", "project:app"]);
  expect(headers).toBeInstanceOf(Headers);
  expect(headers.get("Netlify-CDN-Cache-Control")).toBe("public, max-age=60, stale-while-revalidate=300, durable");
  expect(headers.get("Cache-Control")).toBe("public, max-age=0, must-revalidate");
  expect(headers.get("Netlify-Cache-Tag")).toBe("content,project:app");
});
