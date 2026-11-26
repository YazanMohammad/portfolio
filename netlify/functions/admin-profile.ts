import type { Config } from "@netlify/functions";
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { profile } from "../../db/schema";
import { ProfileInput } from "../../shared/index";
import { adminHandler } from "../../server/handlers";
import { json, notFound, readJson } from "../../server/http";
import { profileToRow, toProfile } from "../../server/mappers";
import { touchLastSaved } from "../../server/last-saved";
import { purgeContent } from "../../server/cache";

export default adminHandler(async req => {
  if (new URL(req.url).pathname !== "/api/admin/profile" || !["GET", "PUT"].includes(req.method)) throw notFound();
  const input = req.method === "PUT" ? await readJson(req, ProfileInput) : null;
  const old = await db.query.profile.findFirst({ where: eq(profile.id, 1) });
  if (!old) throw notFound();
  if (!input) return json(toProfile(old));
  const saved = profileToRow(input);
  await touchLastSaved(db.update(profile).set(saved).where(eq(profile.id, 1)));
  await purgeContent();
  return json(toProfile({ ...saved, id: 1 }));
});
export const config: Config = { path: "/api/admin/profile" };
