import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import fallback from "@/content/fallback.json";
import type { PublicContent } from "@shared/index";
import { Hero } from "./Hero";
import { Nav } from "./Nav";
import { WorkSection } from "./WorkSection";
import { SkillsSection } from "./SkillsSection";
import { TimelineSection } from "./TimelineSection";
const content = fallback as unknown as PublicContent;
describe("editorial public site", () => {
  it("leads with a personal name, not a generic claim", () => {
    render(<Hero profile={content.profile} projects={content.projects} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(content.profile.name);
    expect(screen.getByText("AI Engineer")).toBeInTheDocument();
  });
  it("opens and closes the mobile anchor index in React", () => {
    render(<Nav name={content.profile.name} sections={[{id:"work",label:"Work"},{id:"contact",label:"Contact"}]} />);
    const toggle=screen.getByRole("button",{name:"Index +"});
    fireEvent.click(toggle); expect(toggle).toHaveAttribute("aria-expanded","true");
    fireEvent.click(screen.getByRole("link",{name:"Work"})); expect(toggle).toHaveAttribute("aria-expanded","false");
  });
  it("numbers every project and gives it a title-based visual", () => {
    const {container}=render(<WorkSection projects={content.projects} />);
    expect(container.querySelectorAll(".project-entry")).toHaveLength(content.projects.length);
    content.projects.forEach((p,i)=>{const row=container.querySelectorAll(".project-entry")[i] as HTMLElement;expect(within(row).getByText(String(i+1).padStart(2,"0"))).toBeInTheDocument();expect(within(row).getByRole("link",{name:p.title})).toHaveAttribute("href",`/projects/${p.slug}`);expect(row.querySelector(".type-plate")).toHaveAttribute("aria-hidden","true");});
  });
  it("typesets skills without icon tiles", () => {
    const {container}=render(<SkillsSection skills={content.skills} />);
    content.skills.forEach(s=>expect(screen.getByText(s.name, { selector: "li" })).toBeInTheDocument());
    expect(container.querySelector("img, svg")).toBeNull();
  });
  it("never associates AI Engineer with dates or an employer, or prints education metrics", () => {
    const ai={...content.experience[0],company:"Private employer",startDate:"2026-01",endDate:null};
    render(<TimelineSection experience={[ai,content.experience[1]]} education={content.education} />);
    expect(screen.queryByText("Private employer")).toBeNull();expect(screen.queryByText(/2026/)).toBeNull();expect(screen.queryByText(/GPA/)).toBeNull();expect(screen.getByText(/Xocialive/)).toBeInTheDocument();
  });
  it("keeps the editorial link, numeral, margin and grid contracts", () => {
    const css = readFileSync("src/components/site/site.css", "utf8");
    expect(css).not.toContain("scaleX(.25)");
    expect(css).toContain(":focus-visible::after");
    expect(css).toContain("text-decoration-thickness: 1px");
    expect(css).toContain(".skills__group li { white-space: nowrap; }");
    expect(css).toContain(".project-margin { grid-column: 1 / 4;");
    expect(css).toContain(".hero__intro { grid-column: 4 / 11;");
    const { container } = render(<WorkSection projects={content.projects.map((p, index) => ({ ...p, id: 99 + index * 3 }))} />);
    container.querySelectorAll(".project-entry").forEach((row, index) => {
      expect(row).toHaveAttribute("id", `project-${content.projects[index].slug}`);
      expect(row.querySelector(".type-plate")).toHaveClass(`type-plate--${index % 3}`);
    });
    expect(container.querySelector(".project-text h3 .num")).toHaveTextContent("1");
  });
  it("removes the kit and scopes the new palette away from admin", () => {
    const html=readFileSync("index.html","utf8");expect(html).not.toMatch(/data-kit|boot\.js|\/assets\//);
    expect(existsSync("public/kit-entry.js")).toBe(false);
    const css=readFileSync("src/components/site/site.css","utf8");expect(css).toContain(".site-shell");expect(css).toContain("prefers-reduced-motion");
    expect(css).not.toMatch(/linear-gradient|radial-gradient|backdrop-filter/);
  });
});
