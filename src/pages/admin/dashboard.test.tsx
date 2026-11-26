import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AdminSummary, Message } from "@shared/index";
import { renderWithProviders } from "@/test/render";
import { UnsavedProvider } from "@/lib/admin/unsaved";
import App from "@/App";
import AdminDashboard from "./dashboard";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiGet: vi.fn() };
});
import { apiGet } from "@/lib/api";

const message = (id: number, name: string, subject: string | null, createdAt: string): Message => ({
  id, name, subject, createdAt, email: "sender@example.com", message: "Hello",
  isRead: false, archivedAt: null,
});
const summary: AdminSummary = {
  unreadCount: 3,
  recentMessages: [
    message(40, "Older", "Old subject", "2026-11-25T08:00:00Z"),
    message(43, "Avery", "New project", "2026-11-25T11:00:00Z"),
    message(42, "Sam", null, "2026-11-25T10:00:00Z"),
    message(41, "Jordan", "Question", "2026-11-25T09:00:00Z"),
  ],
  counts: { projects: 12, experience: 4, education: 2, skills: 18, messages: 25 },
  toFillIn: [], lastSavedAt: null,
};
function renderDashboard() {
  return renderWithProviders(<UnsavedProvider><AdminDashboard /></UnsavedProvider>, { path: "/admin/dashboard" });
}

describe("AdminDashboard", () => {
  it("shows shown and hidden project counts with the real hero preview",async()=>{
    vi.mocked(apiGet).mockImplementation(async path=>path==='/api/admin/projects'?[{id:1,isVisible:true},{id:2,isVisible:false},{id:3,isVisible:true}]:summary);
    renderDashboard();await screen.findByText('Projects shown');
    expect(await screen.findByLabelText('2 projects shown')).toBeInTheDocument();
    expect(screen.getByLabelText('1 projects hidden')).toBeInTheDocument();
    expect(screen.getByLabelText('3 unread messages')).toBeInTheDocument();
  });
  it("keeps zero counts visible and renders fewer than three messages with an empty-subject fallback", async () => {
    vi.mocked(apiGet).mockResolvedValue({ ...summary,
      counts: { projects: 0, experience: 0, education: 0, skills: 0, messages: 1 },
      recentMessages: [message(5, "Casey", "", "2026-11-25T11:30:00Z")],
    });
    renderDashboard();
    const link = await screen.findByRole("link", { name: "Casey (no subject) 30 minutes ago" });
    expect(link).toHaveAttribute("href", "/admin/messages?open=5");
    expect(within(screen.getByRole("region", { name: "Messages" })).getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Projects 0" })).toHaveAttribute("href", "/admin/projects");
  });
  it("the authenticated dashboard route renders the dashboard rather than the placeholder", async () => {
    vi.mocked(apiGet).mockImplementation(async (path) => {
      if (path === "/api/auth/me") return { authenticated: true };
      if (path === "/api/admin/summary") return summary;
      throw new Error(`Unexpected request: ${path}`);
    });
    renderWithProviders(<App />, { path: "/admin/dashboard" });
    expect(await screen.findByText("3 unread")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Dashboard", level: 1 })).toBeInTheDocument();
  });
  it("loading shows skeletons for the messages, five counts, fill-in and saved boxes", () => {
    vi.mocked(apiGet).mockReturnValue(new Promise(() => {}));
    renderDashboard();
    expect(screen.getByRole("status")).toHaveTextContent("Loading dashboard");
    expect(screen.getAllByTestId("dashboard-skeleton")).toHaveLength(8);
    for (const name of ["Messages", "Content", "To fill in", "Last saved"]) {
      expect(screen.getByRole("region", { name })).toBeInTheDocument();
    }
    expect(screen.queryByText("Never")).not.toBeInTheDocument();
    expect(screen.queryByText("Nothing to fill in.")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("error shows a Try again button that refetches", async () => {
    vi.mocked(apiGet).mockRejectedValueOnce(new Error("Unavailable")).mockResolvedValue(summary);
    renderDashboard();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load dashboard.");
    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("3 unread")).toBeInTheDocument();
    expect(vi.mocked(apiGet).mock.calls.filter(([path])=>path === "/api/admin/summary")).toHaveLength(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("shows no unread messages and an empty recent list", async () => {
    vi.mocked(apiGet).mockResolvedValue({ ...summary, unreadCount: 0, recentMessages: [] });
    renderDashboard();
    expect(await screen.findByText("No unread messages")).toBeInTheDocument();
    const panel = screen.getByRole("region", { name: "Messages" });
    expect(within(panel).getByText("No messages yet.")).toBeInTheDocument();
    expect(within(panel).queryByRole("link")).not.toBeInTheDocument();
  });
  it('lastSavedAt null shows "Never"', async () => {
    renderDashboard();
    expect(await screen.findByText("Never")).toBeInTheDocument();
    const panel = screen.getByRole("region", { name: "Last saved" });
    expect(within(panel).getByText("Never")).toBeInTheDocument();
  });

  it("last saved shows a fixed English date and relative time", async () => {
    vi.mocked(apiGet).mockResolvedValue({ ...summary, lastSavedAt: "2026-11-24T12:00:00Z" });
    renderDashboard();
    await screen.findByText("24 Nov 2026");
    const panel = screen.getByRole("region", { name: "Last saved" });
    expect(panel).toHaveTextContent("24 Nov 2026");
    expect(panel).toHaveTextContent("1 day ago");
    expect(within(panel).getByText("24 Nov 2026")).toHaveAttribute("datetime", "2026-11-24T12:00:00Z");
  });
  it("to-fill-in items link to the profile page or ?edit=id", async () => {
    const items: AdminSummary["toFillIn"] = [
      { section: "profile", id: null, field: "bio", label: "Add a bio" },
      { section: "projects", id: 7, field: "summary", label: "Project summary" },
      { section: "experience", id: 8, field: "description", label: "Experience description" },
      { section: "education", id: 9, field: "description", label: "Education description" },
    ];
    vi.mocked(apiGet).mockResolvedValue({ ...summary, toFillIn: items });
    const { location } = renderDashboard();
    await screen.findByRole("link", { name: "Add a bio" });
    const panel = screen.getByRole("region", { name: "To fill in" });
    for (const item of items) {
      const link = within(panel).getByRole("link", { name: item.label });
      expect(link).toHaveAttribute("href", item.section === "profile" ? "/admin/profile" : `/admin/${item.section}?edit=${item.id}`);
    }
    await userEvent.setup().click(within(panel).getByRole("link", { name: "Project summary" }));
    expect(location()).toBe("/admin/projects?edit=7");
  });

  it('no fill-in items shows "Nothing to fill in."', async () => {
    renderDashboard();
    expect(await screen.findByText("Nothing to fill in.")).toBeInTheDocument();
  });
  it("count tiles show projects/experience/education/skills/messages numbers", async () => {
    renderDashboard();
    await screen.findByRole("link", { name: "Projects 12" });
    const content = screen.getByRole("region", { name: "Content" });
    for (const [section, count] of Object.entries(summary.counts)) {
      const label = section[0].toUpperCase() + section.slice(1);
      const link = within(content).getByRole("link", { name: `${label} ${count}` });
      expect(link).toHaveAttribute("href", `/admin/${section}`);
      expect(within(link).getByText(String(count))).toHaveClass("tabular-nums");
    }
    expect(within(content).getAllByRole("link")).toHaveLength(5);
    expect(within(content).getByRole("list")).toHaveClass("grid-cols-2");
  });
  beforeEach(() => {
    // Freeze Date only: query notifications and user-event keep real timers.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-25T12:00:00Z"));
    vi.mocked(apiGet).mockReset().mockResolvedValue(summary);
  });
  afterEach(() => vi.useRealTimers());

  it("shows unread count and three newest messages with links to ?open=id", async () => {
    const { location } = renderDashboard();
    expect(await screen.findByText("3 unread")).toBeInTheDocument();
    const panel = screen.getByRole("region", { name: "Messages" });
    const links = within(panel).getAllByRole("link");
    expect(links).toHaveLength(3);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/admin/messages?open=43", "/admin/messages?open=42", "/admin/messages?open=41",
    ]);
    expect(links[0]).toHaveTextContent("Avery");
    expect(links[0]).toHaveTextContent("New project");
    expect(links[0]).toHaveTextContent("about 1 hour ago");
    expect(links[1]).toHaveTextContent("Sam");
    expect(links[1]).toHaveTextContent("(no subject)");
    expect(links[2]).toHaveTextContent("Jordan");
    expect(screen.queryByText("Older")).not.toBeInTheDocument();
    expect(apiGet).toHaveBeenCalledWith("/api/admin/summary");
    links[0].focus();
    expect(links[0]).toHaveFocus();
    expect(links[0]).toHaveClass("focus-visible:outline-2");
    await userEvent.setup().keyboard("{Enter}");
    expect(location()).toBe("/admin/messages?open=43");
  });
});
