import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/render";
import { AdminLayout } from "./AdminLayout";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiGet: vi.fn(), apiSend: vi.fn() };
});
import { apiGet, apiSend } from "@/lib/api";

const summary = (unreadCount: number) => ({
  unreadCount,
  recentMessages: [],
  counts: { projects: 0, experience: 0, education: 0, skills: 0, messages: 0 },
  toFillIn: [],
  lastSavedAt: null,
});

const original = window.matchMedia;
function setMobile(mobile: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: mobile,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

import { SaveBar } from "./form/SaveBar";
import { useState } from "react";
import { fireEvent } from "@testing-library/react";
it("marks the dirty page and saves with Ctrl+S", async()=>{
  vi.mocked(apiGet).mockResolvedValue(summary(0));setMobile(false);
  const save=vi.fn();
  function Form(){const [dirty,setDirty]=useState(false);return <><input aria-label="Draft" onChange={()=>setDirty(true)}/><SaveBar formId="test" dirty={dirty} saving={false} formError={null} onSave={()=>{save();setDirty(false);}} onDiscard={()=>setDirty(false)}/></>;}
  renderWithProviders(<AdminLayout><Form/></AdminLayout>,{path:"/admin/profile"});
  fireEvent.change(screen.getByLabelText("Draft"),{target:{value:"new"}});
  expect(await screen.findByLabelText("Profile has unsaved changes")).toBeInTheDocument();
  fireEvent.keyDown(document,{key:"s",ctrlKey:true});expect(save).toHaveBeenCalledOnce();
  await waitFor(()=>expect(screen.queryByLabelText("Profile has unsaved changes")).toBeNull());
});
const LINKS = ["Dashboard", "Profile", "Projects", "Experience", "Education", "Skills", "Site text", "Look", "Account"];

describe("AdminLayout", () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset();
    vi.mocked(apiSend).mockReset();
    vi.mocked(apiGet).mockResolvedValue(summary(3));
    setMobile(false);
  });
  afterEach(() => {
    window.matchMedia = original;
  });

  it("shows unread count on Messages link", async () => {
    renderWithProviders(<AdminLayout><p>Body</p></AdminLayout>, { path: "/admin/dashboard" });
    const link = await screen.findByLabelText("Messages, 3 unread");
    expect(link).toHaveAttribute("href", "/admin/messages");
    expect(screen.getByText("Body").closest("main")).toHaveAttribute("id", "main");
    for (const name of LINKS) expect(screen.getByRole("link", { name })).toBeInTheDocument();
  });

  it("hides the badge at 0", async () => {
    vi.mocked(apiGet).mockResolvedValue(summary(0));
    renderWithProviders(<AdminLayout><p>Body</p></AdminLayout>, { path: "/admin/dashboard" });
    await waitFor(() => expect(apiGet).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByLabelText(/unread/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Messages" })).toBeInTheDocument();
  });

  it("gives Site text its own icon",()=>{
    renderWithProviders(<AdminLayout><p>Body</p></AdminLayout>,{path:"/admin/site-text"});
    expect(screen.getByRole("link",{name:"Site text"}).querySelector("svg")).toHaveClass("lucide-type");
    expect(screen.getByRole("link",{name:"Profile"}).querySelector("svg")).toHaveClass("lucide-user");
  });
  it("marks the current page", () => {
    renderWithProviders(<AdminLayout><p>Body</p></AdminLayout>, { path: "/admin/projects" });
    expect(screen.getByRole("link", { name: "Projects" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Profile" })).not.toHaveAttribute("aria-current");
  });

  it("View site opens in a new tab", () => {
    renderWithProviders(<AdminLayout><p>Body</p></AdminLayout>, { path: "/admin/dashboard" });
    const a = screen.getByRole("link", { name: /View site/ });
    expect(a).toHaveAttribute("href", "/");
    expect(a).toHaveAttribute("target", "_blank");
    expect(a).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("Log out calls POST /api/auth/logout then goes to /admin", async () => {
    vi.mocked(apiSend).mockResolvedValue(undefined);
    const { location } = renderWithProviders(<AdminLayout><p>Body</p></AdminLayout>, { path: "/admin/dashboard" });
    await userEvent.click(screen.getByRole("button", { name: "Log out" }));
    await waitFor(() => expect(location()).toBe("/admin"));
    expect(apiSend).toHaveBeenCalledWith("POST", "/api/auth/logout");
  });

  it("menu button opens the drawer with the same links", async () => {
    setMobile(true);
    renderWithProviders(<AdminLayout><p>Body</p></AdminLayout>, { path: "/admin/dashboard" });
    expect(screen.queryByRole("link", { name: "Profile" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Open menu" }));
    const dialog = await screen.findByRole("dialog");
    for (const name of LINKS) expect(within(dialog).getByRole("link", { name })).toBeInTheDocument();
    expect(await within(dialog).findByLabelText("Messages, 3 unread")).toBeInTheDocument();
  });
});
