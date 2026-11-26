import { createContext, useContext, type CSSProperties } from "react";
import { mergeSettings, derivePalette, type SiteTheme } from "@shared/settings";
export const SiteSettingsContext = createContext(mergeSettings());
export const useSiteCopy = () => useContext(SiteSettingsContext).copy;
export const useSiteTheme = () => {
 const theme = useContext(SiteSettingsContext).theme;
 return {...theme,...derivePalette(theme.hue)};
};
/** Fixed property allowlist; every value comes from the shared pure palette function. */
export function themeStyle(theme: SiteTheme): CSSProperties {
 const palette = derivePalette(theme.hue);
 return {"--bg":palette.bg,"--surface":palette.surface,"--line":palette.line,"--ink":palette.text,"--muted":palette.muted,"--accent":palette.accent,"--palette-accent":palette.accent,"--on-accent":palette.onAccent} as CSSProperties;
}
