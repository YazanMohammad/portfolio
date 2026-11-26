import { siteCopy } from "../../content/copy";
type Dates = typeof siteCopy.dates;

function month(value: string, dates: Dates): string {
  const MONTHS = [dates.jan, dates.feb, dates.mar, dates.apr, dates.may, dates.jun, dates.jul, dates.aug, dates.sep, dates.oct, dates.nov, dates.dec];
  const match = /^(\d{4})-(\d{2})/.exec(value);
  const name = match ? MONTHS[Number(match[2]) - 1] : undefined;
  return match && name ? `${name} ${match[1]}` : value;
}

/** "Sep 2024 – Jan 2025", "Since Sep 2024", "Until Jan 2025"; null when nothing is known. */
export function formatRange(start: string | null, end: string | null, current: boolean, dates: Dates = siteCopy.dates): string | null {
  if (start && end && !current) return `${month(start, dates)} – ${month(end, dates)}`;
  if (start) return current || !end ? `${dates.since} ${month(start, dates)}` : `${month(start, dates)} – ${month(end, dates)}`;
  if (end && !current) return `${dates.until} ${month(end, dates)}`;
  return null;
}

/** "https://github.com/x" -> "github.com/x" (no protocol, no trailing slash). */
export function hostLabel(url: string): string {
  return url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").replace(/\/+$/, "");
}

export function paragraphs(text: string): string[] {
  const newline = String.fromCharCode(10);
  const blankLine = new RegExp(newline + "[ " + String.fromCharCode(9) + "]*" + newline);
  return text.replaceAll(String.fromCharCode(13), "").split(blankLine).map(p => p.trim()).filter(Boolean);
}
