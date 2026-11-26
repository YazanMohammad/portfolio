import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiRequestError } from "@/lib/api";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { renderWithProviders } from "@/test/render";
import AdminAccount from "./account";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiGet: vi.fn(), apiSend: vi.fn() };
});
import { apiGet, apiSend } from "@/lib/api";

const summary = { unreadCount: 0, recentMessages: [], counts: {}, toFillIn: [], lastSavedAt: null };
const CURRENT = "the current password";
const NEXT = "a brand new password";

function setup() {
  const user = userEvent.setup();
  const view = renderWithProviders(<AdminLayout><AdminAccount /></AdminLayout>, { path: "/admin/account" });
  return { user, ...view };
}

async function fill(user: ReturnType<typeof userEvent.setup>, values: { username?: string; current?: string; next?: string; confirm?: string }) {
  const field = await screen.findByLabelText(/^Username/);
  if (values.username !== undefined) { await user.clear(field); await user.type(field, values.username); }
  if (values.current) await user.type(screen.getByLabelText(/^Current password/), values.current);
  if (values.next) await user.type(screen.getByLabelText(/^New password/), values.next);
  if (values.confirm) await user.type(screen.getByLabelText(/^Confirm new password/), values.confirm);
}

const save = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole("button", { name: "Save" }));

describe("AdminAccount", () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset();
    vi.mocked(apiSend).mockReset();
    vi.mocked(apiGet).mockImplementation(async (path: string) => (path === "/api/admin/account" ? { username: "Yazan" } : summary) as never);
  });

  it("shows the page header and the current username, with no password filled in", async () => {
    setup();
    expect(await screen.findByRole("heading", { level: 1, name: "Account" })).toBeInTheDocument();
    expect(await screen.findByLabelText(/^Username/)).toHaveValue("Yazan");
    expect(screen.getByLabelText(/^Current password/)).toHaveValue("");
    expect(screen.getByLabelText(/^Current password/)).toHaveAttribute("type", "password");
    expect(screen.getByLabelText(/^New password/)).toHaveAttribute("autocomplete", "new-password");
  });

  it("is listed in the sidebar under Site", async () => {
    setup();
    const link = await screen.findByRole("link", { name: "Account" });
    expect(link).toHaveAttribute("href", "/admin/account");
    expect(link).toHaveAttribute("aria-current", "page");
  });

  it("changing the username needs the current password and sends no new password", async () => {
    vi.mocked(apiSend).mockResolvedValue({ username: "Admin2" });
    const { user } = setup();
    await fill(user, { username: "Admin2" });
    await save(user);
    expect(await screen.findByText("Enter your current password.")).toBeInTheDocument();
    expect(apiSend).not.toHaveBeenCalled();
    await fill(user, { current: CURRENT });
    await save(user);
    await waitFor(() => expect(apiSend).toHaveBeenCalledWith("PUT", "/api/admin/account", { username: "Admin2", currentPassword: CURRENT }));
    expect((await screen.findAllByText("Saved", { exact: true })).length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getByLabelText(/^Current password/)).toHaveValue(""));
  });

  it("a new password needs 12 characters and a matching confirmation", async () => {
    vi.mocked(apiSend).mockResolvedValue({ username: "Yazan" });
    const { user } = setup();
    await fill(user, { current: CURRENT, next: "short", confirm: "short" });
    await save(user);
    expect(await screen.findByText("Use at least 12 characters.")).toBeInTheDocument();
    await user.clear(screen.getByLabelText(/^New password/)); await user.type(screen.getByLabelText(/^New password/), NEXT);
    await user.clear(screen.getByLabelText(/^Confirm new password/)); await user.type(screen.getByLabelText(/^Confirm new password/), `${NEXT}x`);
    await save(user);
    expect(await screen.findByText("The passwords do not match.")).toBeInTheDocument();
    expect(apiSend).not.toHaveBeenCalled();
    await user.clear(screen.getByLabelText(/^Confirm new password/)); await user.type(screen.getByLabelText(/^Confirm new password/), NEXT);
    await save(user);
    await waitFor(() => expect(apiSend).toHaveBeenCalledWith("PUT", "/api/admin/account", { username: "Yazan", currentPassword: CURRENT, newPassword: NEXT }));
    expect((await screen.findAllByText("Saved", { exact: true })).length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getByLabelText(/^New password/)).toHaveValue(""));
  });

  it("a wrong current password shows on that field and does not log out", async () => {
    vi.mocked(apiSend).mockRejectedValue(new ApiRequestError("Wrong current password.", 401, "unauthorized", { currentPassword: "Wrong password." }));
    const { user, location } = setup();
    await fill(user, { username: "Admin2", current: "wrong password" });
    await save(user);
    expect(await screen.findByText("Wrong password.")).toBeInTheDocument();
    expect(location()).toBe("/admin/account");
    expect(screen.getByLabelText(/^Current password/)).toHaveValue("");
  });

  it("a stale save (409) shows the reload message and stays on the page", async () => {
    vi.mocked(apiSend).mockRejectedValue(new ApiRequestError("Your account changed. Reload and try again.", 409, "conflict"));
    const { user, location } = setup();
    await fill(user, { username: "Admin2", current: CURRENT });
    await save(user);
    const alerts = await screen.findAllByRole("alert");
    expect(alerts.map((a) => a.textContent).join(" ")).toContain("Your account changed. Reload and try again.");
    expect(location()).toBe("/admin/account");
  });

  it("too many wrong attempts shows the slow-down message", async () => {
    vi.mocked(apiSend).mockRejectedValue(new ApiRequestError("slow", 429, "rate_limited", undefined, 120));
    const { user } = setup();
    await fill(user, { username: "Admin2", current: CURRENT });
    await save(user);
    const alerts = await screen.findAllByRole("alert");
    expect(alerts.map((a) => a.textContent).join(" ")).toContain("Too many wrong attempts. Try again in 2 minutes.");
  });

  it("a lost session (401 without field) still goes to the login page", async () => {
    vi.mocked(apiSend).mockRejectedValue(new ApiRequestError("Please log in.", 401, "unauthorized"));
    const { user, location } = setup();
    await fill(user, { username: "Admin2", current: CURRENT });
    await save(user);
    await waitFor(() => expect(location()).toBe("/admin?expired=1"));
  });

  it("unsaved edits are guarded", async () => {
    const { user } = setup();
    await fill(user, { username: "Admin2" });
    await user.click(screen.getByRole("link", { name: "Dashboard" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/unsaved/i)).toBeInTheDocument();
  });
});
