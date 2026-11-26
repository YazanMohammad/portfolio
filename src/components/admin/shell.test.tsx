import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/render";
import { AdminLayout } from "./AdminLayout";
import { SaveBar } from "./form/SaveBar";
import AdminLogin from "@/pages/admin/login";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiGet: vi.fn(), apiSend: vi.fn() };
});
import { apiGet } from "@/lib/api";

const summary = { unreadCount: 0, recentMessages: [], counts: {}, toFillIn: [], lastSavedAt: null };
const bar = (p: Partial<React.ComponentProps<typeof SaveBar>> = {}) => (
  <SaveBar formId="t" dirty={false} saving={false} formError={null} onSave={() => {}} onDiscard={() => {}} {...p} />
);

describe("admin shell", () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockResolvedValue(summary);
    window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never;
  });

  it("sets a per-route title", async () => {
    renderWithProviders(<AdminLayout><p>x</p></AdminLayout>, { path: "/admin/projects" });
    await waitFor(() => expect(document.title).toBe("Projects · Admin"));
  });

  it("login sets its own title", () => {
    vi.mocked(apiGet).mockRejectedValue(new Error("no"));
    renderWithProviders(<AdminLogin />, { path: "/admin" });
    expect(document.title).toBe("Log in · Admin");
  });

  it("marks the current link, uses distinct Look/Skills icons, and flags View site as new tab", async () => {
    renderWithProviders(<AdminLayout><p>x</p></AdminLayout>, { path: "/admin/look" });
    expect(await screen.findByRole("link", { name: "Look" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Skills" })).not.toHaveAttribute("aria-current");
    const icon = (n: string) => screen.getByRole("link", { name: n }).querySelector("svg")!.getAttribute("class");
    expect(icon("Look")).not.toBe(icon("Skills"));
    expect(screen.getByRole("link", { name: /View site\s*\(opens in new tab\)/ })).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: "Look" }).textContent).not.toMatch(/[→↗]/);
  });

  it("Ctrl+S is always prevented; clean state says Nothing to save", async () => {
    renderWithProviders(<AdminLayout><p>x</p></AdminLayout>, { path: "/admin/dashboard" });
    const ev = new KeyboardEvent("keydown", { key: "s", ctrlKey: true, cancelable: true, bubbles: true });
    document.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(await screen.findByText("Nothing to save")).toBeInTheDocument();
  });

  it("ignores Alt/Shift variants and saves only plain Ctrl/Cmd+S when dirty", () => {
    const onSave = vi.fn();
    renderWithProviders(<AdminLayout>{bar({ dirty: true, onSave })}</AdminLayout>, { path: "/admin/profile" });
    fireEvent.keyDown(document, { key: "s", ctrlKey: true, altKey: true });
    fireEvent.keyDown(document, { key: "s", ctrlKey: true, shiftKey: true });
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "s", metaKey: true });
    expect(onSave).toHaveBeenCalledOnce();
  });

  it("does not save when saving, and says so", async () => {
    const onSave = vi.fn();
    renderWithProviders(<AdminLayout>{bar({ dirty: true, saving: true, onSave })}</AdminLayout>, { path: "/admin/profile" });
    fireEvent.keyDown(document, { key: "s", ctrlKey: true });
    expect(onSave).not.toHaveBeenCalled();
    expect(await screen.findByText("Nothing to save")).toBeInTheDocument();
  });

  it("SaveBar shows Unsaved changes with a dot, All changes saved when clean", () => {
    const { unmount } = renderWithProviders(<AdminLayout>{bar()}</AdminLayout>, { path: "/admin/profile" });
    expect(screen.getByText("All changes saved")).toBeInTheDocument();
    unmount();
    renderWithProviders(<AdminLayout>{bar({ dirty: true })}</AdminLayout>, { path: "/admin/profile" });
    const s = screen.getByText("Unsaved changes");
    expect(s.className).toContain("admin-save-state--dirty");
    expect(s.querySelector(".admin-dirty-dot")).not.toBeNull();
    expect(screen.queryByText("All changes saved")).toBeNull();
  });

  it("unsaved dialog returns focus to the opener", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminLayout>{bar({ dirty: true })}</AdminLayout>, { path: "/admin/profile" });
    const logout = screen.getByRole("button", { name: /Log out/ });
    logout.focus();
    await user.click(logout);
    await user.click(await screen.findByRole("button", { name: "Keep editing" }));
    await waitFor(() => expect(logout).toHaveFocus());
  });
});
