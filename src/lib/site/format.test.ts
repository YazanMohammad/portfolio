import { describe, expect, it } from "vitest";
import { formatRange, hostLabel, paragraphs } from "./format";

describe("formatRange", () => {
  it("formats closed, open and partial ranges", () => {
    expect(formatRange("2024-09", "2025-01", false)).toBe("Sep 2024 – Jan 2025");
    expect(formatRange("2024-09", null, true)).toBe("Since Sep 2024");
    expect(formatRange(null, null, true)).toBeNull();
    expect(formatRange(null, "2025-01", false)).toBe("Until Jan 2025");
    expect(formatRange(null, null, false)).toBeNull();
  });
});

describe("paragraphs", () => {
  it("splits on blank lines, trims, drops empty", () => {
    expect(paragraphs("a\n\n\nb ")).toEqual(["a", "b"]);
    expect(paragraphs("  \n\n ")).toEqual([]);
  });
});

describe("hostLabel", () => {
  it("drops the protocol", () => {
    expect(hostLabel("https://github.com/YazanMohammad")).toBe("github.com/YazanMohammad");
    expect(hostLabel("https://example.com/")).toBe("example.com");
  });
});
