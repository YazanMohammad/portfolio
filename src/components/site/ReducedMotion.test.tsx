import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = (name: string) => readFileSync(`src/components/site/${name}`, "utf8");
const index = readFileSync("src/index.css", "utf8");

describe("reduced-motion scrolling", () => {
  it("forces scroll-behavior:auto for html under prefers-reduced-motion, beating smooth", () => {
    const block = css("site.css").match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/)![0];
    expect(block).toMatch(/html[^{]*\{\s*scroll-behavior:\s*auto\s*!important/);
    expect(index).not.toMatch(/scroll-behavior:\s*smooth\s*!important/);
  });
  it("uses no smooth JS scrolling in the public site", () => {
    for (const f of ["Nav.tsx", "Hero.tsx", "ContactForm.tsx", "SkillsSection.tsx"]) expect(css(f)).not.toMatch(/behavior:\s*["']smooth/);
  });
});
