import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { PublicContent } from "@shared/index";
import fallback from "@/content/fallback.json";
import { Hero } from "./Hero";
import { SkillsSection } from "./SkillsSection";
import { ProjectCard } from "./ProjectCard";
const content = fallback as unknown as PublicContent;
function media(reduced = false, fine = true) {
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ matches: query.includes("reduced-motion") ? reduced : fine, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
}
afterEach(() => vi.unstubAllGlobals());
it("exposes role and location in a real bordered label block", () => {
  media(); const { container } = render(<Hero profile={content.profile} />);
  const label = container.querySelector(".hero-label")!;
  expect(label).toHaveTextContent("AI Engineer"); expect(label).toHaveTextContent("Jordan");
  expect(label).not.toHaveAttribute("aria-hidden");
  expect(container.querySelector(".hero-stamp, .hand-stroke, textPath")).toBeNull();
});
it("hides marquee duplicates while preserving one grouped skills list", () => {
  media(); const { container } = render(<SkillsSection skills={content.skills} />);
  expect(container.querySelector(".skills-marquee")).toHaveAttribute("aria-hidden", "true");
  expect(screen.getAllByRole("list")).toHaveLength(1);
  expect(screen.getAllByRole("listitem")).toHaveLength(content.skills.length);
  expect(screen.getByRole("heading", { name: "Languages" })).toBeVisible();
});
it("uses static drawn accents and no cursor plate for reduced motion", () => {
  media(true); const { container } = render(<><Hero profile={content.profile}/><ProjectCard project={content.projects[0]} /></>);
  expect(container.querySelector("canvas.dither")).toHaveAttribute("aria-hidden", "true");
  expect(container.querySelector(".cursor-plate")).toBeNull();
});
it("does not render cursor plates on touch but keeps the in-flow preview", () => {
  media(false, false); const { container } = render(<ProjectCard project={content.projects[0]} />);
  expect(container.querySelector(".cursor-plate")).toBeNull();
  expect(container.querySelector(".project-visual .project-frame")).not.toBeNull();
});
it("provides cursor plates only for fine pointers without reduced motion", () => {
  media(); const { container } = render(<ProjectCard project={content.projects[0]} />);
  expect(container.querySelector(".cursor-plate")).toHaveAttribute("aria-hidden", "true");
});
