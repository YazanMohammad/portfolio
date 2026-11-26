import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicContent } from "@shared/index";
import fallback from "@/content/fallback.json";
import { apiGet } from "@/lib/api";
import { siteCopy } from "@/content/copy";
import { useSiteContent } from "@/lib/site/use-content";
import { makeApiError, renderWithClient } from "@/test/utils";
import Home from "./Home";

vi.mock("@/lib/api", async (original) => ({ ...await original<typeof import("@/lib/api")>(), apiGet: vi.fn() }));
const content = fallback as unknown as PublicContent;
const resolve = (over: Partial<PublicContent> = {}, profile: Partial<PublicContent["profile"]> = {}) =>
  vi.mocked(apiGet).mockResolvedValue({ ...content, ...over, profile: { ...content.profile, ...profile } });
const h2s = () => screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
const navText = () => screen.getByRole("navigation", { name: "Main" }).textContent ?? "";

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe("Home", () => {
  it("renders the section headings in page order", async () => {
    resolve();
    renderWithClient(<Home />);
    await waitFor(() => expect(vi.mocked(apiGet)).toHaveBeenCalled());
    const c = siteCopy;
    expect(h2s()).toEqual([c.work.heading, c.skills.heading, c.timeline.heading, c.about.heading, c.contact.heading]);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(content.profile.name);
  });

  it("shows the API content once it arrives", async () => {
    resolve({}, { intro: "Intro that only the API sends." });
    renderWithClient(<Home />);
    expect(await screen.findByText("Intro that only the API sends.")).toBeInTheDocument();
    expect(screen.queryByText(content.profile.intro)).toBeNull();
  });

  it("falls back to the snapshot after the API fails with 500", async () => {
    vi.mocked(apiGet).mockRejectedValue(makeApiError({ status: 500 }));
    const { client } = renderWithClient(<Home />);
    await waitFor(() => expect(client.getQueryState(["content"])?.status).toBe("error"), { timeout: 4000 });
    expect(vi.mocked(apiGet).mock.calls.length).toBeGreaterThan(1); // retried, then gave up
    expect(screen.getByText((_, element) => element?.tagName === "P" && element.textContent === content.profile.intro)).toBeInTheDocument();
    expect(document.querySelector("h1")).toHaveTextContent(content.profile.name);
    expect(screen.queryByRole("link", { name: "Download CV" })).toBeNull();
  });

  it("reports source fallback after a 500 and api after success", async () => {
    vi.mocked(apiGet).mockRejectedValue(makeApiError({ status: 500 }));
    const seen: string[] = [];
    function Probe() { const { source, isPending } = useSiteContent(); if (!isPending) seen.push(source); return null; }
    renderWithClient(<Probe />);
    await waitFor(() => expect(seen.length).toBeGreaterThan(0), { timeout: 4000 });
    expect(seen.at(-1)).toBe("fallback");
    seen.length = 0;
    vi.mocked(apiGet).mockReset();
    resolve();
    renderWithClient(<Probe />);
    await waitFor(() => expect(seen.at(-1)).toBe("api"));
  });

  it("hides the primary hero button when there are no projects", async () => {
    resolve({ projects: [] });
    renderWithClient(<Home />);
    await waitFor(() => expect(navText()).not.toContain(siteCopy.nav.work));
    expect(screen.queryByRole("link", { name: new RegExp(siteCopy.hero.primary) })).toBeNull();
    expect(document.querySelector('a[href="#work"]')).toBeNull();
  });

  it("keeps the primary hero button when there are projects", async () => {
    resolve();
    renderWithClient(<Home />);
    expect(await screen.findByRole("link", { name: new RegExp(siteCopy.hero.primary) })).toHaveAttribute("href", "#work");
  });

  it("drops work, skills and about headings and nav links when empty", async () => {
    resolve({ projects: [], skills: [] }, { about: "" });
    renderWithClient(<Home />);
    await waitFor(() => expect(navText()).not.toContain(siteCopy.nav.work));
    const c = siteCopy;
    expect(h2s()).not.toContain(c.work.heading);
    expect(h2s()).not.toContain(c.skills.heading);
    expect(h2s()).not.toContain(c.about.heading);
    const nav = within(screen.getByRole("navigation", { name: "Main" }));
    for (const label of [c.nav.work, c.nav.skills, c.nav.about]) expect(nav.queryByRole("link", { name: label })).toBeNull();
  });

  it("shows the CV link and the photo when set", async () => {
    resolve({}, { cvUrl: "/cv", photoUrl: "/api/files/p" });
    const { container } = renderWithClient(<Home />);
    expect(await screen.findByRole("link", { name: "Download CV" })).toHaveAttribute("href", "/cv");
    expect(container.querySelector('img[src="/api/files/p"]')).not.toBeNull();
  });

  it("sets the document title", async () => {
    resolve();
    renderWithClient(<Home />);
    await waitFor(() => expect(document.title).toBe("Yazan Mohammad: AI Engineer"));
  });

  it("keeps the contact heading readable without a script-owned moment", async () => {
    resolve(); const {container}=renderWithClient(<Home />);
    expect(screen.getByRole("heading",{level:2,name:siteCopy.contact.heading})).toBeVisible();
    expect(container.querySelector("[data-moment]")).toBeNull();
    container.querySelectorAll("canvas").forEach(canvas => expect(canvas).toHaveAttribute("aria-hidden", "true"));
  });
});
