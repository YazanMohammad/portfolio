import { describe, expect, it } from "vitest";
import { contrast, derivePalette } from "@shared/palette";
import { ADMIN_TEXT_SURFACE, adminAccentText } from "./accent-text";

describe("adminAccentText", () => {
  it("preserves sufficient palette accents and lifts insufficient ones without losing tone", () => {
    const preserved = new Set<string>();let lifted=0;
    for(let hue=0;hue<360;hue++){
      const accent=derivePalette(hue).accent,text=adminAccentText(hue);
      if(contrast(accent,ADMIN_TEXT_SURFACE)>=4.5){expect(text,`hue ${hue}`).toBe(accent);preserved.add(text);}
      else {expect(text).not.toBe(accent);expect(text).not.toBe("#ffffff");expect(contrast(text,ADMIN_TEXT_SURFACE)).toBeGreaterThan(contrast(accent,ADMIN_TEXT_SURFACE));lifted++;}
    }
    expect(preserved.size).toBeGreaterThan(10);expect(lifted).toBeGreaterThan(0);
  });
  it("reaches 4.5:1 on every admin surface at every Tone hue", () => {
    for (let hue = 0; hue < 360; hue++) {
      const text = adminAccentText(hue);
      for (const surface of [ADMIN_TEXT_SURFACE, "#141414", "#0c0c0c", "#101010"]) {
        expect(contrast(text, surface), `hue ${hue} on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
