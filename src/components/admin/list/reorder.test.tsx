import { describe, it, expect } from "vitest";
import { moveId, nextSortOrder } from "./reorder";

const row = (sortOrder: number) => ({ id: sortOrder + 1, isVisible: true, sortOrder });

describe("moveId", () => {
  it("moves item down", () => expect(moveId([1, 2, 3], 0, 1)).toEqual([2, 1, 3]));
  it("moves item up", () => expect(moveId([1, 2, 3], 2, 0)).toEqual([3, 1, 2]));
  it("same index returns equal copy", () => {
    const ids = [1, 2, 3];
    const out = moveId(ids, 1, 1);
    expect(out).toEqual(ids);
    expect(out).not.toBe(ids);
  });
  it("out of range returns unchanged copy", () => {
    const ids = [1, 2, 3];
    expect(moveId(ids, 0, 3)).toEqual(ids);
    expect(moveId(ids, -1, 1)).toEqual(ids);
    expect(moveId(ids, 5, 0)).not.toBe(ids);
  });
});

describe("nextSortOrder", () => {
  it("of empty list is 0", () => expect(nextSortOrder([])).toBe(0));
  it("is max+1", () => expect(nextSortOrder([row(0), row(4), row(2)])).toBe(5));
});
