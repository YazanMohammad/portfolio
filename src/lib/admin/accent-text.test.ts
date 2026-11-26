import { describe, expect, it } from "vitest";
import { contrast } from "@shared/palette";
import { ADMIN_TEXT_SURFACE, adminAccentText } from "./accent-text";

describe("adminAccentText", () => {
  it("reaches 4.5:1 on every admin surface at every Tone hue", () => {
    for (let hue = 0; hue < 360; hue++) {
      const text = adminAccentText(hue);
      for (const surface of [ADMIN_TEXT_SURFACE, "#141414", "#0c0c0c", "#101010"]) {
        expect(contrast(text, surface), `hue ${hue} on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
