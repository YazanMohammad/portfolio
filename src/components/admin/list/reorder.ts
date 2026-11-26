import type { Row } from "./types";

/** Returns a new id list with the item at `from` moved to `to`. Out-of-range returns an unchanged copy. */
export function moveId(ids: number[], from: number, to: number): number[] {
  const next = [...ids];
  if (from < 0 || to < 0 || from >= ids.length || to >= ids.length || from === to) return next;
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function nextSortOrder(rows: Pick<Row, "sortOrder">[]): number {
  return rows.length === 0 ? 0 : Math.max(...rows.map((r) => r.sortOrder)) + 1;
}
