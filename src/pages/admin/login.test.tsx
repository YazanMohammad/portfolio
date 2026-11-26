import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/render";
import AdminLogin from "./login";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiGet: vi.fn(), apiSend: vi.fn() };
});
import { apiGet, apiSend, ApiRequestError } from "@/lib/api";

async function submit(password = "hunter2") {
  const user = userEvent.setup();
  const field = await screen.findByLabelText("Password");
  await user.type(field, password);
  await user.click(screen.getByRole("button", { name: "Log in" }));
  return field;
}

describe("AdminLogin", () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset();
    vi.mocked(apiSend).mockReset();
    vi.mocked(apiGet).mockRejectedValue(new ApiRequestError("Sign in required", 401, "unauthorized"));
  });

  it('wrong password shows "Wrong password."', async () => {
    vi.mocked(apiSend).mockRejectedValue(new ApiRequestError("no", 401, "unauthorized"));
    renderWithProviders(<AdminLogin />, { path: "/admin" });
    const field = await submit();
    expect(await screen.findByRole("alert")).toHaveTextContent("Wrong password.");
    await waitFor(() => expect(field).toHaveValue(""));
    expect(field).toHaveFocus();
  });

  it("429 shows slow-down message", async () => {
    vi.mocked(apiSend).mockRejectedValue(new ApiRequestError("slow", 429, "rate_limited", undefined, 600));
    renderWithProviders(<AdminLogin />, { path: "/admin" });
    await submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many wrong attempts. Try again in 10 minutes.",
    );
  });

  it("429 without Retry-After falls back to 15 minutes", async () => {
    vi.mocked(apiSend).mockRejectedValue(new ApiRequestError("slow", 429, "rate_limited"));
    renderWithProviders(<AdminLogin />, { path: "/admin" });
    await submit();
    expect(await screen.findByRole("alert")).toHaveTextContent("15 minutes");
  });

  it('?expired=1 shows "Your session ended. Log in again."', async () => {
    renderWithProviders(<AdminLogin />, { path: "/admin?expired=1" });
    expect(await screen.findByRole("alert")).toHaveTextContent("Your session ended. Log in again.");
  });

  it("success navigates to /admin/dashboard", async () => {
    vi.mocked(apiSend).mockResolvedValue(undefined);
    vi.mocked(apiGet).mockRejectedValueOnce(new ApiRequestError("x", 401, "unauthorized"));
    vi.mocked(apiGet).mockResolvedValue({ authenticated: true });
    const { location } = renderWithProviders(<AdminLogin />, { path: "/admin" });
    await submit();
    await waitFor(() => expect(location()).toBe("/admin/dashboard"));
  });
});
