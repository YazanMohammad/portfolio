import { z } from "zod";
export { derivePalette, contrastPairs, contrast } from "./palette";
import { siteCopy } from "../src/content/copy";

export type SiteCopy = typeof siteCopy;
export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };
export const longCopyKeys = new Set(["lead", "sent", "networkError", "rateLimited", "line", "loadError", "description"]);
function copyShape(value: Record<string, unknown>): z.ZodTypeAny {
  return z.object(Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    (typeof item === "string" ? z.string().trim().max(longCopyKeys.has(key) ? 1000 : 300) : copyShape(item as Record<string, unknown>)).optional(),
  ]))).strict();
}
export const CopyOverrides = copyShape(siteCopy) as z.ZodType<DeepPartial<SiteCopy>>;
export const themeDefaults = {
  hue: 73,
  grid: true, sphere: true, sectionShapes: true, marquee: true, cursorPreview: true, nameReveal: true,
  heroShape: "sphere" as "sphere" | "ring" | "halfDisc", highlightWord: "Jordan",
};
export type SiteTheme = typeof themeDefaults;
export const toggleKeys = ["grid", "sphere", "sectionShapes", "marquee", "cursorPreview", "nameReveal"] as const;
export const ThemeOverrides = z.object({
  hue: z.number().int().min(0).max(359).optional(),
  grid: z.boolean().optional(), sphere: z.boolean().optional(), sectionShapes: z.boolean().optional(), marquee: z.boolean().optional(), cursorPreview: z.boolean().optional(), nameReveal: z.boolean().optional(),
  heroShape: z.enum(["sphere", "ring", "halfDisc"]).optional(), highlightWord: z.string().trim().max(40).optional(),
}).strict();
/** Read only known default keys and valid leaves; old/future/malformed stored values cannot reach the UI. */
function mergeCopy(defaults: Record<string, unknown>, input: unknown): Record<string, unknown> {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
  return Object.fromEntries(Object.entries(defaults).map(([key, value]) => {
    const candidate = source[key];
    return [key, typeof value === "string"
      ? (typeof candidate === "string" && candidate.trim() && candidate.trim().length <= (longCopyKeys.has(key) ? 1000 : 300) ? candidate.trim() : value)
      : mergeCopy(value as Record<string, unknown>, candidate)];
  }));
}
export function mergeSettings(input?: {copy?: unknown; theme?: unknown} | null): {copy: SiteCopy; theme: SiteTheme} {
  const theme = { ...themeDefaults };
  const source = input?.theme && typeof input.theme === "object" ? input.theme as Record<string, unknown> : {};
  for (const key of Object.keys(ThemeOverrides.shape) as (keyof SiteTheme)[]) {
    const result = ThemeOverrides.shape[key].safeParse(source[key]);
    if (result.success && result.data !== undefined) Object.assign(theme, { [key]: result.data });
  }
  return { copy: mergeCopy(siteCopy, input?.copy) as SiteCopy, theme };
}
export const SettingsInput = z.object({ copy: CopyOverrides.optional(), theme: ThemeOverrides.optional() }).strict();
export type SettingsInput = z.infer<typeof SettingsInput>;
export type AdminSettings = { copy: DeepPartial<SiteCopy>; theme: Partial<SiteTheme>; defaults: {copy: SiteCopy; theme: SiteTheme}; updatedAt: string | null };
