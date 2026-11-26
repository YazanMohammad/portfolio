import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PublicContent, ProjectCard as ProjectCardData } from "@shared/index";
import fallback from "@/content/fallback.json";
import { fileUrl } from "@/lib/api";
import { WorkSection } from "./WorkSection";
import { ProjectFrame } from "./ProjectFrame";

const base = (fallback as unknown as PublicContent).projects[0] as ProjectCardData;
let n = 0;
const make = (over: Partial<ProjectCardData> = {}): ProjectCardData => ({
  ...base, id: ++n, featured: true, imageKey: null, imageAlt: null, liveUrl: null, githubUrl: null, ...over,
});

describe("WorkSection", () => {
  it("renders nothing for no projects", () => {
    const { container } = render(<WorkSection projects={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("is the #work section", () => {
    const { container } = render(<WorkSection projects={[make()]} />);
    expect(container.querySelector("section#work")).not.toBeNull();
  });

  it("shows an image with its alt when imageKey is set", () => {
    const { container } = render(<WorkSection projects={[make({ imageKey: "k", imageAlt: "Chat app screen" })]} />);
    const img = container.querySelector("img")!;
    expect(img).toHaveAttribute("src", fileUrl("k"));
    expect(img).toHaveAttribute("alt", "Chat app screen");
  });

  it("shows a labelled stand-in without an image", () => {
    const p = make({ technologies: ["t1", "t2", "t3", "t4", "t5", "t6"] });
    render(<ProjectFrame project={p} />);
    const { container } = render(<ProjectFrame project={p} />);
    expect(screen.queryByRole("img")).toBeNull();
    const frame = container.querySelector(".type-plate")!;
    expect(frame).toHaveAttribute("aria-hidden", "true");
    expect(frame).toHaveTextContent(p.category);
    expect(frame).toHaveTextContent("t1");
    expect(frame).not.toHaveTextContent("t6");
  });

  it("renders no external link when both urls are null", () => {
    const { container } = render(<WorkSection projects={[make(), make({ slug: "b", featured: false })]} />);
    expect(container.querySelector('a[href^="http"]')).toBeNull();
    expect(container.querySelectorAll("a:not([href]), a[href='']")).toHaveLength(0);
  });

  it("opens external links safely", () => {
    const { container } = render(<WorkSection projects={[make({ liveUrl: "https://x.com/", githubUrl: "https://github.com/a/b" })]} />);
    const links = container.querySelectorAll('a[href^="http"]');
    expect(links).toHaveLength(2);
    links.forEach((a) => {
      expect(a).toHaveAttribute("rel", "noopener noreferrer");
      expect(a).toHaveAttribute("target", "_blank");
    });
  });

  it("lists technologies, and no ul when empty", () => {
    const { container, unmount } = render(<WorkSection projects={[make({ technologies: ["React", "C#"] })]} />);
    expect(within(container.querySelector("ul.tags")!).getAllByRole("listitem")).toHaveLength(2);
    unmount();
    const r = render(<WorkSection projects={[make({ technologies: [] })]} />);
    expect(r.container.querySelector("ul")).toBeNull();
  });

  it("preserves the API order regardless of featured flags", () => {
    const {container}=render(<WorkSection projects={[make({title:"First",featured:false}),make({title:"Second",featured:true})]}/>);
    expect([...container.querySelectorAll(".project-entry h3")].map(h=>h.textContent)).toEqual(["First","Second"]);
  });
});
