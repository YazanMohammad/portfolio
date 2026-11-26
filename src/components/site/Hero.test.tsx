import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PublicContent } from "@shared/index";
import fallback from "@/content/fallback.json";
import { siteCopy } from "@/content/copy";
import { Hero } from "./Hero";

const content = fallback as unknown as PublicContent;
const base = content.profile;
const view = (over: Partial<PublicContent["profile"]> = {}, projects = content.projects) =>
  render(<Hero profile={{ ...base, ...over }} projects={projects} />);

describe("Hero", () => {
  it("sets the name as h1 and role as kicker", () => {
    const { container } = view();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(base.name);
    expect(container.querySelector(".hero__kicker")).toHaveTextContent("AI Engineer");
  });

  it("points the primary action at #work", () => {
    view();
    expect(screen.getByRole("link", { name: siteCopy.hero.primary })).toHaveAttribute("href", "#work");
  });

  it("drops the primary action when there are no projects to point at", () => {
    const { container } = view({}, []);
    expect(screen.queryByRole("link", { name: siteCopy.hero.primary })).toBeNull();
    expect(container.querySelector('a[href="#work"]')).toBeNull();
  });

  it("hides Download CV without a cv and shows it with one", () => {
    const { unmount } = view({ cvUrl: null });
    expect(screen.queryByRole("link", { name: "Download CV" })).toBeNull();
    unmount();
    view({ cvUrl: "/cv" });
    expect(screen.getByRole("link", { name: "Download CV" })).toHaveAttribute("href", "/cv");
  });

  it("javascript: cvUrl renders no Download CV link", () => {
    view({ cvUrl: "javascript:alert(1)" as unknown as "/cv" });
    expect(screen.queryByRole("link", { name: "Download CV" })).toBeNull();
  });

  it("shows availability text only when set", () => {
    const { unmount } = view({ available: true, availabilityText: null });
    expect(screen.queryByText("Open to work")).toBeNull();
    unmount();
    view({ available: true, availabilityText: "Open to work" });
    expect(screen.getByText("Open to work")).toBeInTheDocument();
  });

  it("leaves no empty meta node when location is null", () => {
    const { container } = view({ location: null, available: false, availabilityText: null });
    expect(container.querySelector(".hero__meta:empty")).toBeNull();
    expect(container.textContent).not.toContain("Jordan, ");
  });

  it("lists project titles as numbered contents linked to their rows", () => {
    const { container } = view();
    const contents = screen.getByRole("navigation", { name: "Project contents" });
    content.projects.forEach((project, index) => {
      const link = contents.querySelectorAll("a")[index];
      expect(link).toHaveTextContent(`${String(index + 1).padStart(2, "0")} ${project.title}`);
      expect(link).toHaveAttribute("href", `#project-${project.slug}`);
    });
    expect(contents.querySelectorAll("a")).toHaveLength(content.projects.length);
    expect(container.textContent).not.toContain("I build for the web.");
  });

  it("uses supplied API projects rather than a hard-coded contents list", () => {
    const project = { ...content.projects[0], id: 700, slug: "api-title", title: "API Project 12" };
    view({}, [project]);
    const contents = screen.getByRole("navigation", { name: "Project contents" });
    expect(contents.querySelectorAll("a")).toHaveLength(1);
    expect(contents.querySelector("a")).toHaveTextContent("01 API Project 12");
    expect(contents.querySelector("a")).toHaveAttribute("href", "#project-api-title");
    expect(screen.queryByText("Chat App")).toBeNull();
  });

  it("omits contents for zero projects", () => {
    view({}, []);
    expect(screen.queryByRole("navigation", { name: "Project contents" })).toBeNull();
  });
});
