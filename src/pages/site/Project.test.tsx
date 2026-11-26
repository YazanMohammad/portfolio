import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicContent, PublicProject } from "@shared/index";
import fallback from "@/content/fallback.json";
import { apiGet, fileUrl } from "@/lib/api";
import { siteCopy } from "@/content/copy";
import { makeApiError, renderWithClient } from "@/test/utils";
import { readFileSync } from "node:fs";
import Project from "./Project";

vi.mock("@/lib/api", async (original) => ({ ...await original<typeof import("@/lib/api")>(), apiGet: vi.fn() }));
const content = fallback as unknown as PublicContent;
const card = content.projects[0];
const project: PublicProject = { ...card, body: "# Details\n\nBuilt with care.", role: "Developer", technologies: ["React", "TypeScript"], liveUrl: "https://example.com", githubUrl: "https://github.com/example/demo", imageKey: "folder/picture.png", imageUrl: null, imageAlt: "Project screenshot" };
function mount(value: PublicProject | Promise<PublicProject> = project, slug = card.slug) {
  vi.mocked(apiGet).mockImplementation((path) => path === "/api/content" ? Promise.resolve(content) : Promise.resolve(value));
  return renderWithClient(<Project />, { path: `/projects/${slug}` });
}
beforeEach(() => vi.clearAllMocks());

describe("Project", () => {
  it("has a plain one-screen footer with no moment", () => {
    const { container } = mount(new Promise(() => {}));
    expect(container.querySelector("[data-moment]")).toBeNull();
    expect(container.querySelector(".mo-la__type, .mo-la__sub")).toBeNull();
    expect(container.querySelector("footer#contact")?.getAttribute("style") ?? "").not.toContain("--h");
  });

  it("keeps snapshot title, summary, metadata and back link while loading", () => {
    mount(new Promise(() => {}));
    expect(screen.getByRole("heading", { name: card.title, level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: siteCopy.project.back })).toHaveAttribute("href", "/#work");
    expect(document.title).toBe(`${card.title} | Yazan Mohammad`);
    expect(screen.getByRole("article")).toHaveAttribute("aria-busy", "true");
  });

  it("keeps a useful pending heading for an unknown slug", () => {
    mount(new Promise(() => {}), "unknown");
    expect(screen.getByRole("heading", { level: 1 })).not.toHaveTextContent(/^$/);
    expect(screen.getByRole("link", { name: siteCopy.project.back })).toBeInTheDocument();
  });

  it("renders project NotFound and its title on 404", async () => {
    vi.mocked(apiGet).mockImplementation((path) => path === "/api/content" ? Promise.resolve(content) : Promise.reject(makeApiError({ status: 404, code: "not_found" })));
    const { container } = renderWithClient(<Project />, { path: `/projects/${card.slug}` });
    expect(await screen.findByRole("heading", { name: siteCopy.project.notFound.heading })).toBeInTheDocument();
    expect(screen.getByText(siteCopy.project.notFound.line)).toBeInTheDocument();
    expect(document.title.toLowerCase()).toContain("not found");
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(screen.getByRole("link", { name: siteCopy.project.notFound.action })).toHaveAttribute("href", "/");
  });

  it("shows useful load error and back link on 500 instead of stale body", async () => {
    vi.mocked(apiGet).mockImplementation((path) => path === "/api/content" ? Promise.resolve(content) : Promise.reject(makeApiError({ status: 500 })));
    renderWithClient(<Project />, { path: `/projects/${card.slug}` });
    expect(await screen.findByRole("alert", {}, { timeout: 4000 })).toHaveTextContent(siteCopy.project.loadError);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(card.title);
    expect(screen.getByRole("link", { name: siteCopy.project.back })).toHaveAttribute("href", "/#work");
  });

  it("omits empty optional facts, links, body and image", async () => {
    const { container } = mount({ ...project, role: null, technologies: [], liveUrl: null, githubUrl: null, body: "  ", imageKey: null });
    await waitFor(() => expect(screen.getByRole("article")).toHaveAttribute("aria-busy", "false"));
    expect(container.querySelector(".project-facts, .project-body, .project-picture")).toBeNull();
  });

  it("rejects unsafe project URLs using the shared guard", async () => {
    mount({ ...project, liveUrl: "javascript:alert(1)", githubUrl: "//evil.example/code" });
    await screen.findByRole("heading", { name: "Details" });
    const main = within(screen.getByRole("main"));
    expect(main.queryByRole("link", { name: siteCopy.work.viewLive })).toBeNull();
    expect(main.queryByRole("link", { name: siteCopy.work.viewCode })).toBeNull();
  });

  it("defines picture reservation and token-based detail containment", () => {
    const css = readFileSync("src/styles/project.css", "utf8");
    expect(css).toMatch(/main > \.project-detail\.section\s*\{[^}]*height:\s*auto/);
    expect(css).toMatch(/\.project-picture\s*\{[^}]*aspect-ratio:\s*16\s*\/\s*10/);
    expect(css).toMatch(/\.project-picture img\s*\{[^}]*object-fit:\s*contain/);
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|\brgba?\(/i);
  });
  it("renders fetched facts, safe links, reserved image, Markdown and React 19 metadata with one h1", async () => {
    const { container } = mount();
    await screen.findByRole("heading", { name: "Details", level: 2 });
    const main = within(screen.getByRole("main"));
    expect(main.getByRole("heading", { name: project.title, level: 1 })).toBeInTheDocument();
    expect(main.getByText(project.summary)).toBeInTheDocument();
    expect(main.getByText("Developer")).toBeInTheDocument();
    expect(main.getByText("React")).toBeInTheDocument();
    for (const name of [siteCopy.work.viewLive, siteCopy.work.viewCode]) expect(main.getByRole("link", { name })).toHaveAttribute("rel", "noopener noreferrer");
    expect(main.getByRole("img", { name: "Project screenshot" })).toHaveAttribute("src", fileUrl(project.imageKey!));
    expect(container.querySelector(".project-picture")).not.toBeNull();
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(document.title).toBe(`${project.title} | Yazan Mohammad`);
    expect(document.head.querySelector('meta[name="description"]')).toHaveAttribute("content", project.summary);
    expect(apiGet).toHaveBeenCalledWith(`/api/projects/${card.slug}`);
    expect(container.querySelectorAll("#contact")).toHaveLength(1);
    expect(screen.getByRole("button", { name: siteCopy.contact.submit })).toBeInTheDocument();
    expect(container.querySelector('a[href="#work"]')).toBeNull();
  });
});
