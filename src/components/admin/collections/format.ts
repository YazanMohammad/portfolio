import type { YearMonth } from "@shared/index";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2024-09" -> "Sep 2024"; null (or malformed) -> "". */
export function formatYearMonth(v: YearMonth | null): string {
  const m = v ? /^(\d{4})-(\d{2})$/.exec(v) : null;
  const month = m ? MONTHS[Number(m[2]) - 1] : undefined;
  return m && month ? `${month} ${m[1]}` : "";
}

/** "Mar 2022 – May 2023"; omits missing parts without stray separators. */
export function dateRange(start: YearMonth | null, end: YearMonth | null, current = false): string {
  const from = formatYearMonth(start);
  const to = current ? "Present" : formatYearMonth(end);
  return [from, to].filter(Boolean).join(" – ");
}

const COPY_SUFFIX = " (copy)";

/**
 * Name for a duplicate whose UTF-16 length never exceeds `max` (zod counts code units).
 * Never leaves a lone high surrogate or a dangling combining mark at the cut.
 */
export function copyName(base: string, max: number): string {
  let cut = base.slice(0, Math.max(0, max - COPY_SUFFIX.length));
  if (cut.length < base.length) {
    const last = cut.charCodeAt(cut.length - 1);
    if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
    cut = cut.replace(/\p{M}+$/u, "");
  }
  return cut.trimEnd() + COPY_SUFFIX;
}

type ZodLike = { _def: { checks?: readonly { kind: string; value?: unknown }[]; innerType?: ZodLike; schema?: ZodLike } };

/** Max length of a string field in a zod 3 shape, unwrapping preprocess/nullable. */
export function maxOfField(field: unknown): number {
  let z = field as ZodLike;
  while (!z._def.checks && (z._def.innerType || z._def.schema)) z = (z._def.innerType ?? z._def.schema) as ZodLike;
  return Number(z._def.checks?.find((c) => c.kind === "max")?.value);
}
