import { purgeCache } from "@netlify/functions";

export function publicCacheHeaders(tags: string[]): Headers {
  if (process.env.PORTFOLIO_RUNTIME === "vps" || process.env.FILES_DIR) return new Headers({ "Cache-Control": "public, max-age=0, must-revalidate" });
  return new Headers({
    "Cache-Control": "public, max-age=0, must-revalidate",
    "Netlify-CDN-Cache-Control": "public, max-age=60, stale-while-revalidate=300, durable",
    "Netlify-Cache-Tag": tags.join(","),
  });
}

export async function purgeContent(opts: { slugs?: string[] } = {}): Promise<void> {
  if (process.env.PORTFOLIO_RUNTIME === "vps" || process.env.FILES_DIR) return;
  try {
    await purgeCache({ tags: ["content", ...(opts.slugs ?? []).map((slug) => `project:${slug}`)] });
  } catch {
    console.error("Content cache purge failed.");
  }
}
