import { describe, expect, it } from "vitest";
import { safeHref } from "./safe-href";

const BS = String.fromCharCode(92);

describe("safeHref", () => {
  it.each(["/cv", "/files/cv.pdf", "https://example.com/a?b=1", "http://example.com", "HTTPS://Example.com"])("allows %s", (u) => {
    expect(safeHref(u)).toBe(u);
  });

  it("allows mailto only with allowMailto", () => {
    expect(safeHref("mailto:a@b.co")).toBeNull();
    expect(safeHref("mailto:a@b.co", { allowMailto: true })).toBe("mailto:a@b.co");
    expect(safeHref("MAILTO:a@b.co", { allowMailto: true })).toBe("MAILTO:a@b.co");
  });

  it.each([
    "javascript:alert(1)", "JavaScript:alert(1)", " javascript:alert(1)", "java\tscript:alert(1)", "java\nscript:alert(1)",
    "\u0001javascript:alert(1)", "data:text/html,x", "vbscript:x", "//evil.com", `/${BS}evil.com`, `${BS}${BS}evil.com`, `https://${BS}evil.com`, "cv.pdf", "#x", "ftp://x.com", "", "   ",
  ])("rejects %j", (u) => {
    expect(safeHref(u, { allowMailto: true })).toBeNull();
  });

  it("rejects null and undefined", () => {
    expect(safeHref(null)).toBeNull();
    expect(safeHref(undefined)).toBeNull();
  });
});
