import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { apiGet, apiSend } from "@/lib/api";
import { renderWithProviders } from "@/test/render";
import type { Message } from "@shared/index";
import Messages from "./messages";
import App from "@/App";

vi.mock("@/lib/api", async (original) => ({ ...await original<typeof import("@/lib/api")>(), apiGet: vi.fn(), apiSend: vi.fn() }));
const message = (id: number, isRead = false, createdAt = "2026-11-25T12:00:00Z"): Message => ({ id, isRead, createdAt, archivedAt: null, name: `Sender ${id}`, email: "a@b.co", subject: `Subject ${id}`, message: "<b>x</b>\nNext line" });
let rows: Message[];
beforeEach(() => {
  rows = [message(1), message(2, true)];
  vi.mocked(apiGet).mockReset().mockImplementation(async (url) => {
    const status = new URL(`https://test${url}`).searchParams.get("status");
    return rows.filter(m => status === "archived" ? !!m.archivedAt : !m.archivedAt && (status !== "unread" || !m.isRead));
  });
  vi.mocked(apiSend).mockReset().mockImplementation(async (method, url, body) => {
    const id = Number(url.split("/").pop());
    if (method === "DELETE") { rows = rows.filter(m => m.id !== id); return undefined; }
    const patch = body as { isRead?: boolean; archived?: boolean };
    rows = rows.map(m => m.id === id ? { ...m, ...(patch.isRead === undefined ? {} : { isRead: patch.isRead }), ...(patch.archived === undefined ? {} : { archivedAt: patch.archived ? "2026-11-25T13:00:00Z" : null }) } : m);
    return rows.find(m => m.id === id);
  });
});
const renderInbox = (path = "/admin/messages") => renderWithProviders(<Messages />, { path });
const open = async (id = 1) => userEvent.setup().click(await screen.findByRole("button", { name: new RegExp(`Sender ${id}`) }));

describe("messages inbox", () => {
  it("lists unread first then newest, with stable ties", async () => {
    rows = [message(2, true, "2026-11-26T12:00:00Z"), message(1), message(3), message(4, false, "2026-11-26T12:00:00Z")];
    renderInbox();
    await userEvent.setup().click(screen.getByRole("tab", { name: "All" }));
    const list = await screen.findByRole("list", { name: "Messages" });
    await waitFor(() => expect(within(list).getAllByRole("button").map(b => b.textContent)).toEqual([
      expect.stringContaining("Sender 4"), expect.stringContaining("Sender 1"), expect.stringContaining("Sender 3"), expect.stringContaining("Sender 2"),
    ]));
  });
  it("opens unread once, keeps literal body and supplies Reply and copyable email", async () => {
    const { container } = renderInbox();
    await open();
    expect(await screen.findByText("<b>x</b> Next line")).toHaveClass("whitespace-pre-wrap");
    expect(container.querySelector("b")).toBeNull();
    expect(screen.getByRole("link", { name: "Reply by email" })).toHaveAttribute("href", "mailto:a@b.co?subject=Re%3A%20Subject%201");
    expect(screen.getByRole("link", { name: "a@b.co" })).toHaveAttribute("href", "mailto:a@b.co");
    await waitFor(() => expect(apiSend).toHaveBeenCalledTimes(1));
    expect(apiSend).toHaveBeenCalledWith("PATCH", "/api/admin/messages/1", { isRead: true });
    await userEvent.setup().click(screen.getByRole("tab", { name: "All" }));
    await open();
    expect(apiSend).toHaveBeenCalledTimes(1);
  });
  it("opens a read message from query without PATCH", async () => {
    renderInbox("/admin/messages?open=2");
    expect(await screen.findByRole("link", { name: "Reply by email" })).toBeInTheDocument();
    expect(apiSend).not.toHaveBeenCalled();
  });
  it("handles unknown and malformed query ids safely", async () => {
    const view = renderInbox("/admin/messages?open=999");
    expect(await screen.findByText("Message not found.")).toBeInTheDocument();
    view.navigate("/admin/messages?open=1garbage");
    expect(screen.queryByRole("link", { name: "Reply by email" })).not.toBeInTheDocument();
    expect(apiSend).not.toHaveBeenCalled();
  });
  it("archives from Unread and unarchives from Archived", async () => {
    renderInbox();
    await open();
    await userEvent.setup().click(await screen.findByRole("button", { name: "Archive" }));
    await waitFor(() => expect(apiSend).toHaveBeenCalledWith("PATCH", "/api/admin/messages/1", { archived: true }));
    expect(await screen.findByText("No unread messages.")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("tab", { name: "Archived" }));
    await open();
    await userEvent.setup().click(await screen.findByRole("button", { name: "Unarchive" }));
    await waitFor(() => expect(apiSend).toHaveBeenCalledWith("PATCH", "/api/admin/messages/1", { archived: false }));
    expect(await screen.findByText("No archived messages.")).toBeInTheDocument();
  });
  it("asks before delete and keeps confirmation and selection on failure for retry", async () => {
    renderInbox("/admin/messages?open=2");
    await userEvent.setup().click(await screen.findByRole("button", { name: "Delete" }));
    expect(apiSend).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog");
    vi.mocked(apiSend).mockRejectedValueOnce(new Error("Delete failed"));
    await userEvent.setup().click(within(dialog).getByRole("button", { name: "Delete message" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Delete failed");
    await userEvent.setup().click(within(dialog).getByRole("button", { name: "Delete message" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(apiSend).toHaveBeenLastCalledWith("DELETE", "/api/admin/messages/2");
    expect(screen.queryByRole("link", { name: "Reply by email" })).not.toBeInTheDocument();
  });
  it("Mark unread stays unread without auto-read until a new open transition", async () => {
    const view = renderInbox("/admin/messages?open=2");
    await userEvent.setup().click(await screen.findByRole("button", { name: "Mark unread" }));
    expect(await screen.findByRole("button", { name: "Mark read" })).toBeEnabled();
    await userEvent.setup().click(screen.getByRole("tab", { name: "All" }));
    await open(2);
    expect(apiSend).toHaveBeenCalledTimes(1);
    expect(apiSend).toHaveBeenCalledWith("PATCH", "/api/admin/messages/2", { isRead: false });
    view.navigate("/admin/messages");
    await open(2);
    await waitFor(() => expect(apiSend).toHaveBeenCalledTimes(2));
    expect(apiSend).toHaveBeenLastCalledWith("PATCH", "/api/admin/messages/2", { isRead: true });
  });
  it("failed auto-read runs once, retains body and allows explicit retry", async () => {
    vi.mocked(apiSend).mockRejectedValueOnce(new Error("Read failed"));
    renderInbox("/admin/messages?open=1");
    expect(await screen.findByRole("alert")).toHaveTextContent("Read failed");
    await userEvent.setup().click(screen.getByRole("tab", { name: "All" }));
    await open();
    expect(apiSend).toHaveBeenCalledTimes(1);
    expect(screen.getByText("<b>x</b> Next line")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Mark read" }));
    expect(await screen.findByRole("button", { name: "Mark unread" })).toBeEnabled();
    expect(apiSend).toHaveBeenCalledTimes(2);
  });
  it("failed archive retains selection and can be retried", async () => {
    renderInbox("/admin/messages?open=2");
    vi.mocked(apiSend).mockRejectedValueOnce(new Error("Archive failed"));
    await userEvent.setup().click(await screen.findByRole("button", { name: "Archive" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Archive failed");
    expect(screen.getByRole("link", { name: "Reply by email" })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Archive" }));
    expect(await screen.findByRole("button", { name: "Unarchive" })).toBeEnabled();
  });
  it("opens a Sheet on phones and closing permits a fresh open", async () => {
    const media = vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList);
    try {
      renderInbox("/admin/messages?open=2");
      const dialog = await screen.findByRole("dialog", { name: /.+/ });
      expect(within(dialog).getByRole("link", { name: "Reply by email" })).toBeInTheDocument();
      await userEvent.setup().click(within(dialog).getByRole("button", { name: "Close" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    } finally { media.mockRestore(); }
  });
  it("authenticated App uses inbox and refreshes sidebar badge after writes", async () => {
    const get = vi.mocked(apiGet).getMockImplementation()!;
    vi.mocked(apiGet).mockImplementation(async url => {
      if (url === "/api/auth/me") return { authenticated: true };
      if (url === "/api/admin/summary") return { unreadCount: rows.filter(m => !m.isRead && !m.archivedAt).length, recentMessages: [], counts: { projects: 0, experience: 0, education: 0, skills: 0, messages: rows.length }, toFillIn: [], lastSavedAt: null };
      return get(url);
    });
    renderWithProviders(<App />, { path: "/admin/messages" });
    expect(await screen.findByLabelText("Messages, 1 unread")).toBeInTheDocument();
    await open();
    await waitFor(() => expect(screen.queryByLabelText("Messages, 1 unread")).not.toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Messages" })).toBeInTheDocument();
    expect(apiGet).toHaveBeenCalledWith("/api/admin/messages?status=all");
    expect(apiGet).toHaveBeenCalledWith("/api/admin/messages?status=archived");
  });
  it("deep-link lookup errors offer retry rather than claiming not found", async () => {
    const get = vi.mocked(apiGet).getMockImplementation()!;
    vi.mocked(apiGet).mockImplementation(async url => {
      if (url.endsWith("status=all")) throw new Error("Lookup failed");
      return get(url);
    });
    renderInbox("/admin/messages?open=2");
    expect(await screen.findByText("Could not load selected message.")).toBeInTheDocument();
    expect(screen.queryByText("Message not found.")).not.toBeInTheDocument();
    vi.mocked(apiGet).mockImplementation(get);
    await userEvent.setup().click(screen.getByRole("button", { name: "Retry selected message" }));
    expect(await screen.findByRole("link", { name: "Reply by email" })).toBeInTheDocument();
  });
  it("shows empty Unread copy", async () => {
    rows = [];
    renderInbox();
    expect(await screen.findByText("No unread messages.")).toBeInTheDocument();
  });
  it("shows pending and retries a failed query", async () => {
    vi.mocked(apiGet).mockRejectedValueOnce(new Error("Unavailable"));
    renderInbox();
    expect(screen.getByRole("status")).toHaveTextContent("Loading messages");
    await userEvent.setup().click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: /Sender 1/ })).toBeInTheDocument();
  });
});
