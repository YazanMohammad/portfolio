import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PublicContent } from "@shared/index";
import icons from "@/content/icons.json";
import { readdirSync } from "node:fs";
import fallback from "@/content/fallback.json";
import { SkillsSection } from "./SkillsSection";

type Skill = PublicContent["skills"][number];
let n = 0;
const sk = (name: string, category: string, iconSlug: string | null): Skill => ({ id: ++n, name, category, iconSlug, sortOrder: n });

describe("SkillsSection", () => {
  it("renders nothing for no skills", () => {
    expect(render(<SkillsSection skills={[]} />).container).toBeEmptyDOMElement();
  });
  it("groups by category in first-seen order", () => {
    const { container } = render(<SkillsSection skills={[sk("A", "Langs", null), sk("B", "Tools", null), sk("C", "Langs", null)]} />);
    expect(container.querySelector("section#skills")).not.toBeNull();
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Langs", "Tools"]);
    expect(screen.getAllByRole("list")).toHaveLength(2);
    expect(screen.getAllByRole("listitem").map(item => item.textContent)).toEqual(["A", "C", "B"]);
  });
  it("renders database icons as decorative images and no placeholder gap", () => {
    const iconSvg = '<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>';
    const {container}=render(<SkillsSection skills={[{...sk("TypeScript","Languages","typescript"),iconSvg},sk("LLMs","Tools",null)]}/>);
    const image=container.querySelector('li img')!;
    expect(image).toHaveAttribute('src', `data:image/svg+xml;charset=utf-8,${encodeURIComponent(iconSvg)}`);
    expect(image).toHaveAttribute('alt','');
    expect(screen.getByText('LLMs',{selector:'li'}).children).toHaveLength(0);
    expect(container.querySelector('li svg')).toBeNull();
  });
  it("retains known iconSlug files as a legacy fallback",()=>{
    const {container}=render(<SkillsSection skills={[sk('Python','Languages','python')]} />);
    expect(container.querySelector('li img')).toHaveAttribute('src','/icons/python.svg');
  });
  it("has no levels, bars or percentages", () => {
    const { container } = render(<SkillsSection skills={[sk("TypeScript", "L", "typescript")]} />);
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
    expect(container.textContent).not.toMatch(/\d+%/);
  });
  it("unique manifest slugs exactly match every actual SVG basename", () => {
    const slugs = [...new Set(icons)].sort();
    const files = readdirSync("public/icons", { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".svg"))
      .map((entry) => entry.name.slice(0, -4)).sort();
    expect(icons).toHaveLength(slugs.length);
    expect(slugs).toEqual(files);
  });
  it("fallback's non-null icon slugs are known manifest entries", () => {
    const used = (fallback as unknown as PublicContent).skills.flatMap((s) => s.iconSlug ? [s.iconSlug] : []);
    expect(used.filter((slug) => !icons.includes(slug))).toEqual([]);
  });
});
