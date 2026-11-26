import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/render";
import { RequireAdmin } from "./RequireAdmin";
import { useQueryClient } from "@tanstack/react-query";
import { useSaveProfile } from "@/lib/admin/queries";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiGet: vi.fn(), apiSend: vi.fn() };
});
import { apiGet, apiSend, ApiRequestError } from "@/lib/api";

const unauthorized = () => new ApiRequestError("Sign in required", 401, "unauthorized");

function SaveChild() {
  const save = useSaveProfile();
  return (
    <button onClick={() => save.mutate({} as never)}>Save now</button>
  );
}

function RefetchChild() {
  const qc = useQueryClient();
  return <button onClick={() => void qc.refetchQueries({ queryKey: ["auth", "me"] })}>Refetch</button>;
}

describe("RequireAdmin", () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset();
    vi.mocked(apiSend).mockReset();
  });

  it("redirects to /admin when auth/me returns 401", async () => {
    vi.mocked(apiGet).mockRejectedValue(unauthorized());
    const { location } = renderWithProviders(
      <RequireAdmin><p>Secret</p></RequireAdmin>,
      { path: "/admin/dashboard" },
    );
    await waitFor(() => expect(location()).toBe("/admin"));
    expect(screen.queryByText("Secret")).not.toBeInTheDocument();
  });

  it("renders children when authenticated", async () => {
    vi.mocked(apiGet).mockResolvedValue({ authenticated: true });
    renderWithProviders(<RequireAdmin><p>Secret</p></RequireAdmin>, { path: "/admin/dashboard" });
    expect(await screen.findByText("Secret")).toBeInTheDocument();
  });

  it("shows nothing while loading", async () => {
    vi.mocked(apiGet).mockReturnValue(new Promise(() => {}));
    const { location } = renderWithProviders(
      <RequireAdmin><p>Secret</p></RequireAdmin>,
      { path: "/admin/dashboard" },
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText("Secret")).not.toBeInTheDocument();
    expect(location()).toBe("/admin/dashboard");
  });

  it("a 401 from a later write sends the user to /admin?expired=1", async () => {
    vi.mocked(apiGet).mockResolvedValue({ authenticated: true });
    vi.mocked(apiSend).mockRejectedValue(unauthorized());
    const { location } = renderWithProviders(
      <RequireAdmin><SaveChild /></RequireAdmin>,
      { path: "/admin/profile" },
    );
    await userEvent.click(await screen.findByRole("button", { name: "Save now" }));
    await waitFor(() => expect(location()).toBe("/admin?expired=1"));
    // the guard must not overwrite the expired redirect
    await new Promise((r) => setTimeout(r, 20));
    expect(location()).toBe("/admin?expired=1");
  });

  it("a 401 on auth/me refetch redirects", async () => {
    vi.mocked(apiGet).mockResolvedValueOnce({ authenticated: true });
    vi.mocked(apiGet).mockRejectedValue(unauthorized());
    const { location } = renderWithProviders(
      <RequireAdmin><p>Secret</p><RefetchChild /></RequireAdmin>,
      { path: "/admin/dashboard" },
    );
    await userEvent.click(await screen.findByRole("button", { name: "Refetch" }));
    await waitFor(() => expect(location()).toBe("/admin?expired=1"));
    expect(screen.queryByText("Secret")).not.toBeInTheDocument();
  });
});
