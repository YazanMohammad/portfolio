import { describe, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("@/components/admin/RequireAdmin", () => ({ RequireAdmin: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/admin/AdminLayout", () => ({ AdminLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
const { page } = vi.hoisted(() => ({
  page: (id: string) => ({ default: () => <div data-testid={id} /> }),
}));
vi.mock("@/pages/site/Home", () => page("home"));
vi.mock("@/pages/site/Project", () => page("project"));
vi.mock("@/pages/site/NotFound", () => page("notfound"));
vi.mock("@/pages/admin/login", () => page("login"));
vi.mock("@/pages/admin/dashboard", () => page("dashboard"));
vi.mock("@/pages/admin/profile", () => page("profile"));
vi.mock("@/pages/admin/projects", () => page("projects"));
vi.mock("@/pages/admin/experience", () => page("experience"));
vi.mock("@/pages/admin/education", () => page("education"));
vi.mock("@/pages/admin/skills", () => page("skills"));
vi.mock("@/pages/admin/messages", () => page("messages"));
vi.mock("@/pages/admin/site-text", () => page("site-text"));
vi.mock("@/pages/admin/look", () => page("look"));
import App from "./App";

const table: [string, string][] = [
  ["/", "home"],
  ["/projects/portfolio-v1", "project"],
  ["/admin", "login"],
  ["/admin/dashboard", "dashboard"],
  ["/admin/profile", "profile"],
  ["/admin/site-text", "site-text"],
  ["/admin/look", "look"],
  ["/admin/projects", "projects"],
  ["/admin/experience", "experience"],
  ["/admin/education", "education"],
  ["/admin/skills", "skills"],
  ["/admin/messages", "messages"],
  ["/nope/nothing", "notfound"],
];

describe("App", () => {
  it("route table matches contract", async () => {
    for (const [path, id] of table) {
      window.history.pushState({}, "", path);
      render(<App />);
      expect(await screen.findByTestId(id)).toBeInTheDocument();
      cleanup();
    }
  });
});
