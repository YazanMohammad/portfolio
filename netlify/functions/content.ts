import { mergeSettings } from "../../shared/settings";
import { db } from "../../db/client";
import { education, experience, profile, projects, skills, siteSettings } from "../../db/schema";
import { handle, json, notFound, publicCacheHeaders, toPublicContent } from "../../server/index";

export const config = { path: "/api/content", method: "GET" };

let settingsWarningLogged = false;
function errorCode(error: unknown): string | undefined {
  for (let e = error, depth = 0; e && typeof e === "object" && depth < 3; e = (e as { cause?: unknown }).cause, depth++) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}
// Only a missing table (Postgres 42P01) may fall back to defaults; any other error keeps the endpoint's error path.
const MISSING = Symbol("missing");
function settingsOrFallback(error: unknown): typeof MISSING {
  const code = errorCode(error);
  if (code !== "42P01") throw error;
  warnFallback(code);
  return MISSING;
}
function warnFallback(code: string) {
  if (settingsWarningLogged) return;
  settingsWarningLogged = true;
  console.warn(`Site settings unavailable (${code}); using defaults.`);
}
export default handle(async (req) => {
  if (req.method !== "GET") throw notFound();
  const [owner] = await db.select().from(profile).limit(1);
  if (!owner) throw notFound();
  const [projectRows, experienceRows, educationRows, skillRows, row] = await Promise.all([
    db.select().from(projects), db.select().from(experience),
    db.select().from(education), db.select().from(skills),
    db.query.siteSettings.findFirst().catch(settingsOrFallback),
  ]);
  let fallback = row === MISSING;
  let settings: ReturnType<typeof mergeSettings>;
  try {
    settings = mergeSettings(row === MISSING ? undefined : row);
  } catch {
    warnFallback("malformed");
    settings = mergeSettings(undefined);
    fallback = true;
  }
  return json({ ...toPublicContent({ profile: owner, projects: projectRows, experience: experienceRows,
    education: educationRows, skills: skillRows }), settings }, { headers: fallback ? { "Cache-Control": "no-store" } : publicCacheHeaders(["content"]) });
});
