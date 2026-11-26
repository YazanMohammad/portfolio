import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectInput, type Project } from "@shared/index";
import { ApiRequestError } from "@/lib/api";
import { UnsavedProvider } from "@/lib/admin/unsaved";
import { renderWithProviders } from "@/test/render";
import { ListEditor } from "../list/ListEditor";
import { projectsConfig, slugify, SLUG_MAX, TITLE_MAX } from "./projects";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiGet: vi.fn(), apiSend: vi.fn() };
});
import { apiGet, apiSend } from "@/lib/api";

const project = (over: Partial<Project> = {}): Project => ({
  id: 1,
  slug: "a",
  title: "A",
  summary: "Summary",
  body: "Body",
  role: null,
  category: "Web",
  technologies: ["TS"],
  liveUrl: null,
  githubUrl: null,
  imageKey: null,
  imageAlt: null,
  featured: false,
  isVisible: true,
  sortOrder: 0,
  ...over,
});

let list: Project[];

function setup() {
  vi.mocked(apiGet).mockImplementation((async (url: string) =>
    url === "/api/admin/summary" ? { toFillIn: [] } : list) as never);
  return renderWithProviders(
    <UnsavedProvider>
      <ListEditor config={projectsConfig} />
    </UnsavedProvider>,
    { path: "/admin/projects" },
  );
}

beforeEach(() => {
  list = [project()];
  vi.mocked(apiGet).mockReset();
  vi.mocked(apiSend).mockReset();
  vi.mocked(apiSend).mockResolvedValue(undefined as never);
});

describe("slugify", () => {
  it("collapses punctuation and spaces", () => expect(slugify("Chat App!  v2")).toBe("chat-app-v2"));
  it("strips accents", () => expect(slugify("Ünï Cödé")).toBe("uni-code"));
  it("strips every combining mark, not just U+0300-036F", () => expect(slugify("a᪰b")).toBe("ab"));
  it("handles Vietnamese", () => expect(slugify("Tiếng Việt")).toBe("tieng-viet"));
  it("returns empty for empty input", () => expect(slugify("")).toBe(""));
  it("caps at 80 without a trailing dash", () => {
    const s = slugify(`${"a".repeat(79)} b`);
    expect(s.length).toBeLessThanOrEqual(80);
    expect(s.endsWith("-")).toBe(false);
  });
});

describe("duplicateInput", () => {
  it("picks the first free slug, hides the copy and drops the image", () => {
    const a = project({ slug: "a", imageKey: `${"a".repeat(32)}.jpg`, imageAlt: "x" });
    const all = [a, project({ id: 2, slug: "a-copy" })];
    const dup = projectsConfig.duplicateInput(a, all, 5);
    expect(dup.slug).toBe("a-copy-2");
    expect(dup.title).toBe("A (copy)");
    expect(dup.isVisible).toBe(false);
    expect(dup.imageKey).toBeNull();
    expect(dup.imageAlt).toBeNull();
    expect(dup.sortOrder).toBe(5);
  });
});

describe("duplicate limits", () => {
  it("pins the schema limits", () => {
    expect(SLUG_MAX).toBe(80);
    expect(TITLE_MAX).toBe(100);
  });
  it("duplicate of an 80-char slug stays within the limit and is unique", () => {
    const slug = "a".repeat(SLUG_MAX);
    const a = project({ slug });
    const dup = projectsConfig.duplicateInput(a, [a], 1);
    expect(dup.slug.length).toBeLessThanOrEqual(SLUG_MAX);
    expect(dup.slug).not.toBe(slug);
    const dup2 = projectsConfig.duplicateInput(a, [a, project({ id: 2, slug: dup.slug })], 1);
    expect(dup2.slug.length).toBeLessThanOrEqual(SLUG_MAX);
    expect([slug, dup.slug]).not.toContain(dup2.slug);
    expect(dup2.slug).toMatch(/-copy-2$/);
    expect(ProjectInput.safeParse({ ...dup2, summary: "s" }).success).toBe(true);
  });
  it("trims a trailing dash from the truncated base", () => {
    const slug = `${"a".repeat(74)}-bbbbb`;
    const dup = projectsConfig.duplicateInput(project({ slug }), [], 1);
    expect(dup.slug).not.toContain("--");
    expect(dup.slug.length).toBeLessThanOrEqual(SLUG_MAX);
  });
  it("duplicate title never splits a surrogate pair", () => {
    const dup = projectsConfig.duplicateInput(project({ title: "t".repeat(92) + "\u{1F600}" + "t".repeat(6) }), [], 1);
    expect(dup.title).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
    expect(dup.title.length).toBeLessThanOrEqual(TITLE_MAX);
  });
  it("duplicate of a max-length title stays within the limit", () => {
    const dup = projectsConfig.duplicateInput(project({ title: "t".repeat(TITLE_MAX) }), [], 1);
    expect(dup.title.length).toBeLessThanOrEqual(TITLE_MAX);
    expect(dup.title.endsWith(" (copy)")).toBe(true);
  });
});

function expectDescribedError(input: HTMLElement, message: string | RegExp) {
  expect(input).toHaveAttribute("aria-invalid", "true");
  const ids = (input.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
  const texts = ids.map((id) => document.getElementById(id)?.textContent ?? "");
  expect(texts.some((t) => (typeof message === "string" ? t.includes(message) : message.test(t)))).toBe(true);
}

describe("projects form", () => {
  it("typing a title fills the slug until the slug is edited by hand", async () => {
    setup();
    await userEvent.click((await screen.findAllByRole("button", { name: "Add project" }))[0]);
    const title = await screen.findByLabelText(/^Title/);
    const slug = screen.getByLabelText(/^Slug/) as HTMLInputElement;
    await userEvent.type(title, "My App");
    expect(slug.value).toBe("my-app");
    expect(screen.getByText("/projects/my-app")).toBeInTheDocument();
    await userEvent.type(slug, "-x");
    await userEvent.type(title, " Two");
    expect(slug.value).toBe("my-app-x");
  });

  it("Image without alt text shows the schema error under the alt field", async () => {
    list = [project({ imageKey: `${"a".repeat(32)}.jpg`, imageAlt: null })];
    setup();
    await userEvent.click(await screen.findByText("A"));
    const alt = await screen.findByLabelText(/alt text/i);
    await userEvent.type(alt, "x");
    await userEvent.clear(alt);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expectDescribedError(screen.getByLabelText(/alt text/i), "Add alt text for the image."));
  });

  it("a bad URL shows the schema error under Live URL", async () => {
    setup();
    await userEvent.click(await screen.findByText("A"));
    const live = await screen.findByLabelText(/^Live URL/);
    await userEvent.type(live, "not a url");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    const bad = ProjectInput.safeParse({ ...projectsConfig.emptyInput(0), liveUrl: "not a url" });
    const urlMsg = bad.success ? "" : (bad.error.issues.find((i) => i.path[0] === "liveUrl")?.message ?? "");
    expect(urlMsg).not.toBe("");
    await waitFor(() => expectDescribedError(screen.getByLabelText(/^Live URL/), urlMsg));
    expect(apiSend).not.toHaveBeenCalled();
  });

  it('409 on save shows "That address is already used." under Slug', async () => {
    setup();
    await userEvent.click(await screen.findByText("A"));
    const title = await screen.findByLabelText(/^Title/);
    await userEvent.type(title, "!");
    vi.mocked(apiSend).mockRejectedValueOnce(new ApiRequestError("dup", 409, "conflict"));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expectDescribedError(screen.getByLabelText(/^Slug/), "That address is already used."));
  });
});
