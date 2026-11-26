import { siteCopy } from "../src/content/copy";
import {longCopyKeys, themeDefaults, ThemeOverrides, type SiteTheme, type SiteCopy, type DeepPartial} from "./settings";
/** Sparse, allowlisted overrides for untrusted persisted JSON. Never walk source keys. */
export function sanitizeOverrides(input: unknown): {copy: DeepPartial<SiteCopy>; theme: Partial<SiteTheme>} {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
  function copy(defaults: Record<string, unknown>, value: unknown): Record<string, unknown> {
    const row = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
    const result: Record<string, unknown> = {};
    for (const [key, fallback] of Object.entries(defaults)) {
      if (!Object.hasOwn(row, key)) continue;
      const candidate = row[key];
      if (typeof fallback === "string") {
        if (typeof candidate === "string" && candidate.trim() && candidate.trim().length <= (longCopyKeys.has(key) ? 1000 : 300) && candidate.trim() !== fallback) result[key] = candidate.trim();
      } else {
        const child = copy(fallback as Record<string, unknown>, candidate);
        if (Object.keys(child).length) result[key] = child;
      }
    }
    return result;
  }
  const theme: Partial<SiteTheme> = {};
  const row = source.theme && typeof source.theme === "object" && !Array.isArray(source.theme) ? source.theme as Record<string, unknown> : {};
  for (const key of Object.keys(ThemeOverrides.shape) as (keyof SiteTheme)[]) {
    if (!Object.hasOwn(row, key)) continue;
    const result = ThemeOverrides.shape[key].safeParse(row[key]);
    if (result.success && result.data !== undefined && result.data !== themeDefaults[key]) Object.assign(theme, {[key]:result.data});
  }
  return {copy:copy(siteCopy, source.copy) as DeepPartial<SiteCopy>, theme};
}
