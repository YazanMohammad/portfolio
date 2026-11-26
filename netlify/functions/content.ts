import { mergeSettings } from "../../shared/settings";
import { db } from "../../db/client";
import { education, experience, profile, projects, skills, siteSettings } from "../../db/schema";
import { handle, json, notFound, publicCacheHeaders, toPublicContent } from "../../server/index";

export const config = { path: "/api/content", method: "GET" };

let settingsWarningLogged = false;
export default handle(async (req) => {
  if (req.method !== "GET") throw notFound();
  const [owner] = await db.select().from(profile).limit(1);
  if (!owner) throw notFound();
  const [projectRows, experienceRows, educationRows, skillRows, settings] = await Promise.all([
    db.select().from(projects), db.select().from(experience),
    db.select().from(education), db.select().from(skills),
    db.query.siteSettings.findFirst().catch(() => {
      if (!settingsWarningLogged) { console.warn("Site settings unavailable; using defaults."); settingsWarningLogged = true; }
      return undefined;
    }),
  ]);
  return json({ ...toPublicContent({ profile: owner, projects: projectRows, experience: experienceRows,
    education: educationRows, skills: skillRows }), settings: mergeSettings(settings) }, { headers: publicCacheHeaders(["content"]) });
});
