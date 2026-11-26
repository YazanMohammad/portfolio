import { contrast, derivePalette } from "@shared/palette";

/** Lightest admin surface that carries accent text (the current nav link). */
export const ADMIN_TEXT_SURFACE = "#1c1c1c";

const toHex = (n: number) => Math.round(n).toString(16).padStart(2, "0");

function mixWhite(colour: string, t: number): string {
  const c = [1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16));
  return "#" + c.map((v) => toHex(v + (255 - v) * t)).join("");
}

/**
 * Admin-only accent for TEXT: the palette accent, lifted toward white until it reaches 4.5:1
 * on the lightest admin surface. Does not touch derivePalette's own outputs.
 */
export function adminAccentText(hue: number): string {
  const accent = derivePalette(hue).accent;
  for (let t = 0; t <= 1.0001; t += 0.02) {
    const candidate = mixWhite(accent, Math.min(t, 1));
    if (contrast(candidate, ADMIN_TEXT_SURFACE) >= 4.5) return candidate;
  }
  return "#ffffff";
}
