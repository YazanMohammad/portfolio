import { purgeCache } from "@netlify/functions";

export function publicCacheHeaders(tags: string[]): Headers {
  return new Headers({
    "Cache-Control": "public, max-age=0, must-revalidate",
    "Netlify-CDN-Cache-Control": "public, max-age=60, stale-while-revalidate=300, durable",
    "Netlify-Cache-Tag": tags.join(","),
  });
}

export async function purgeContent(opts: { slugs?: string[] } = {}): Promise<void> {
  try {
    await purgeCache({ tags: ["content", ...(opts.slugs ?? []).map((slug) => `project:${slug}`)] });
  } catch {
    console.error("Content cache purge failed.");
  }
}
