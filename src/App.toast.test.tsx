import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Real App tree: no test wrapper, no mocked layout. Only the network is faked.
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiGet: vi.fn(), apiSend: vi.fn() };
});
import { apiGet, apiSend } from "@/lib/api";
import App from "./App";

const profile = {
  name: "Yazan Maayeh", headline: "Software engineer", intro: "I build things.", about: "About me",
  location: null, email: "me@example.com", githubUrl: null, linkedinUrl: null, available: false,
  availabilityText: null, photoKey: null, photoAlt: null, cvKey: null, updatedAt: "2026-11-25T00:00:00.000Z",
};

describe("App toasts", () => {
  it("shows the Saved toast on an admin route, with exactly one Toaster", async () => {
    vi.mocked(apiGet).mockImplementation((async (url: string) => {
      if (url === "/api/auth/me") return { authenticated: true };
      if (url === "/api/admin/summary") return { unreadCount: 0, recentMessages: [], counts: {}, toFillIn: [], lastSavedAt: null };
      return profile;
    }) as never);
    vi.mocked(apiSend).mockResolvedValue({ ...profile, headline: "Staff engineer" } as never);
    window.history.pushState({}, "", "/admin/profile");
    const user = userEvent.setup();
    render(<App />);
    const headline = await screen.findByLabelText(/^Headline/, {}, { timeout: 15000 });
    await user.clear(headline);
    await user.type(headline, "Staff engineer");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved", { exact: true })).toBeInTheDocument();
    expect(document.querySelectorAll("section[aria-label^='Notifications']")).toHaveLength(1);
  }, 20000);
});
