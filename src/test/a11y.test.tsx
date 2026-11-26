import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "@/App";

vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  apiGet: vi.fn(),
  apiSend: vi.fn(),
  apiUpload: vi.fn(),
}));
import { apiGet, ApiRequestError } from "@/lib/api";

const base = { isVisible: true, sortOrder: 1 };
const data: Record<string, unknown> = {
  "/api/auth/me": { authenticated: true },
  "/api/admin/summary": {
    unreadCount: 1,
    recentMessages: [{ id: 1, name: "Avery", email: "a@b.co", subject: "Hi", message: "Hello", isRead: false, archivedAt: null, createdAt: "2026-11-25T11:00:00Z" }],
    counts: { projects: 1, experience: 1, education: 1, skills: 1, messages: 1 },
    toFillIn: [{ section: "profile", label: "Add a photo", href: "/admin/profile" }],
    lastSavedAt: null,
  },
  "/api/admin/profile": {
    name: "Yazan", headline: "Engineer", intro: "Hi", about: "About", location: null, email: "me@example.com",
    githubUrl: null, linkedinUrl: null, available: false, availabilityText: null, photoKey: null, photoAlt: null, cvKey: null,
    updatedAt: "2026-11-25T00:00:00.000Z",
  },
  "/api/admin/projects": [{ ...base, id: 1, slug: "demo", title: "Demo", summary: "S", body: "B", role: null, category: "Web", technologies: ["TS"], liveUrl: null, githubUrl: null, imageKey: null, imageAlt: null, featured: false }],
  "/api/admin/experience": [{ ...base, id: 1, position: "Dev", company: "Acme", location: null, startDate: "2020-01", endDate: null, current: true, bullets: ["Did x"] }],
  "/api/admin/education": [{ ...base, id: 1, degree: "BSc", school: "Uni", location: null, startDate: "2015-09", endDate: "2019-06", description: null }],
  "/api/admin/skills": [{ ...base, id: 1, name: "React", category: "Frontend", iconSlug: null }],
};
const messages = [{ id: 1, name: "Avery", email: "a@b.co", subject: "Hi", message: "Hello", isRead: false, archivedAt: null, createdAt: "2026-11-25T11:00:00Z" }];

beforeEach(() => {
  vi.mocked(apiGet).mockReset().mockImplementation((async (url: string) => {
    if (url.startsWith("/api/admin/messages")) return messages;
    if (url in data) return data[url];
    throw new ApiRequestError("Not found", 404, "not_found");
  }) as never);
});

function expectNamed(container: HTMLElement) {
  const controls = [...container.querySelectorAll("input, textarea, select, button, [role=switch], [role=combobox], [role=checkbox]")];
  expect(controls.length).toBeGreaterThan(0);
  for (const el of controls) {
    if (el.getAttribute("type") === "hidden" || el.closest("[aria-hidden=true]")) continue;
    expect(el, el.outerHTML.slice(0, 160)).toHaveAccessibleName();
  }
  expect(container.querySelectorAll("h1")).toHaveLength(1);
}

async function visit(path: string, ready: RegExp | string) {
  window.history.pushState({}, "", path);
  const view = render(<App />);
  // App lazy-loads admin routes; the first date-fns/dashboard import can exceed
  // Testing Library's 1s default on a cold Windows worker. Keep real UI checks.
  await screen.findByRole("heading", { level: 1, name: ready }, { timeout: 15000 });
  return view;
}

describe("admin accessibility", () => {
  it("login", async () => {
    vi.mocked(apiGet).mockRejectedValue(new ApiRequestError("No", 401, "unauthorized"));
    const { container } = await visit("/admin", /sign in|log in|admin/i);
    expectNamed(container);
    }, 20000);

  const pages: [string, string, RegExp][] = [
    ["dashboard", "/admin/dashboard", /dashboard/i],
    ["profile", "/admin/profile", /profile/i],
    ["projects", "/admin/projects", /projects/i],
    ["experience", "/admin/experience", /experience/i],
    ["education", "/admin/education", /education/i],
    ["skills", "/admin/skills", /skills/i],
    ["messages", "/admin/messages", /inbox/i],
  ];

  for (const [name, path, heading] of pages) {
    it(`${name}: named controls, one h1, skip link targets #main`, async () => {
      const { container } = await visit(path, heading);
      await waitFor(() => expect(container.querySelector("main")).not.toBeNull());
      await new Promise((r) => setTimeout(r, 50));
      expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute("href", "#main");
      expect(container.querySelector("#main")).not.toBeNull();
      expectNamed(container);
    }, 20000);
  }

  for (const [name, path, heading, row] of [
    ["projects", "/admin/projects", /projects/i, /^Demo/],
    ["experience", "/admin/experience", /experience/i, /^Dev/],
    ["education", "/admin/education", /education/i, /^BSc/],
    ["skills", "/admin/skills", /skills/i, /^React/],
  ] as const) {
    it(`${name}: open edit panel has named controls`, async () => {
      await visit(path, heading);
      await userEvent.setup().click(await screen.findByRole("button", { name: row }));
      const dialog = await screen.findByRole("dialog");
      expect(dialog).toHaveAccessibleName();
      expectNamed(dialog.parentElement ?? dialog) // portal content; h1 count checked on page tests
    });
  }
});
