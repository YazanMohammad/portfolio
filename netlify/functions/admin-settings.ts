import { sanitizeOverrides } from "../../shared/settings-sanitize";
import type { Config } from "@netlify/functions";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client";
import { siteSettings } from "../../db/schema";
import { CopyOverrides, ThemeOverrides, SettingsInput, themeDefaults } from "../../shared/settings";
import { siteCopy } from "../../src/content/copy";
import { adminHandler } from "../../server/handlers";
import { SETTINGS_BODY_BYTES, fail, json, notFound, readJson } from "../../server/http";
import { touchLastSaved } from "../../server/last-saved";
import { purgeContent } from "../../server/cache";
import { zodFields } from "../../server/zod-fields";

const Input = z.object({copy: CopyOverrides.optional(), theme: ThemeOverrides.optional()}).strict();
export default adminHandler(async req => {
  if (new URL(req.url).pathname !== "/api/admin/settings" || !["GET", "PUT"].includes(req.method)) throw notFound();
  const input = req.method === "PUT" ? await readJson(req, Input, SETTINGS_BODY_BYTES) : null;
  const old = await db.query.siteSettings.findFirst({where: eq(siteSettings.id, 1)});
  const response = (copy: unknown, theme: unknown, updatedAt: Date | null) => json({copy, theme, updatedAt: updatedAt?.toISOString() ?? null, defaults: {copy: siteCopy, theme: themeDefaults}});
  const clean = sanitizeOverrides(old);
  if (!input) return response(clean.copy, clean.theme, old?.updatedAt ?? null);
  // Provided branches replace overrides; omitted branches are preserved. Validate the resulting settings together.
  const result = SettingsInput.safeParse({copy: input.copy ?? clean.copy, theme: input.theme ?? clean.theme});
  if (!result.success) throw fail("validation", "Check the fields.", {fields: zodFields(result.error)});
  const saved = {...sanitizeOverrides(result.data), updatedAt: new Date()};
  await touchLastSaved(db.insert(siteSettings).values({id:1, ...saved}).onConflictDoUpdate({target:siteSettings.id, set:saved}));
  await purgeContent();
  return response(saved.copy, saved.theme, saved.updatedAt);
});
export const config: Config = { path: "/api/admin/settings" };
