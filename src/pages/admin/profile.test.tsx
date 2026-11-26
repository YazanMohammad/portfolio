import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import { useQueryClient } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import type { Profile, UploadResult } from "@shared/index";
import { ApiRequestError } from "@/lib/api";
import { GuardedLink } from "@/lib/admin/unsaved";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { renderWithProviders } from "@/test/render";
import AdminProfile from "./profile";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiGet: vi.fn(), apiSend: vi.fn(), apiUpload: vi.fn() };
});
import { apiGet, apiSend, apiUpload, fileUrl } from "@/lib/api";

const profile = (over: Partial<Profile> = {}): Profile => ({
  name: "Yazan Maayeh",
  headline: "Software engineer",
  intro: "I build things.",
  about: "About me",
  location: null,
  email: "me@example.com",
  githubUrl: null,
  linkedinUrl: null,
  available: false,
  availabilityText: null,
  photoKey: null,
  photoAlt: null,
  cvKey: null,
  updatedAt: "2026-11-25T00:00:00.000Z",
  ...over,
});

let current: Profile;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function RefreshProfile() {
  const client = useQueryClient();
  return <button onClick={() => void client.invalidateQueries({ queryKey: ["admin", "profile"] })}>Refresh profile</button>;
}

function setup() {
  vi.mocked(apiGet).mockImplementation((async (url: string) => (url === "/api/admin/summary" ? { unreadCount: 0 } : current)) as never);
  return renderWithProviders(
    <AdminLayout>
      <GuardedLink to="/admin/projects">Leave test link</GuardedLink>
      <RefreshProfile />
      <AdminProfile />
    </AdminLayout>,
    { path: "/admin/profile" },
  );
}

beforeEach(() => {
  current = profile();
  vi.mocked(apiGet).mockReset();
  vi.mocked(apiSend).mockReset();
  vi.mocked(apiUpload).mockReset();
});

const preview = () => screen.getByRole("region", { name: /preview/i });

describe("AdminProfile", () => {
  it("preview updates as the name and intro are typed", async () => {
    const user = userEvent.setup();
    setup();
    const name = await screen.findByLabelText(/^Name/);
    await user.clear(name);
    await user.type(name, "Ada Lovelace");
    const intro = screen.getByLabelText(/^Intro/);
    await user.clear(intro);
    await user.type(intro, "Hello there");
    const p = preview();
    expect(p).toHaveTextContent("Ada Lovelace");
    expect(p).toHaveTextContent("Hello there");
    expect(p).toHaveTextContent("Preview, not the real page");
  });

  it("Download CV button in preview appears only when a CV is set", async () => {
    current = profile({ cvKey: `${"a".repeat(32)}.pdf` });
    setup();
    await screen.findByLabelText(/^Name/);
    expect(preview()).toHaveTextContent("Download CV");
    expect(preview()).toHaveTextContent("See my work");
  });

  it("no CV: no Download CV in preview", async () => {
    setup();
    await screen.findByLabelText(/^Name/);
    expect(preview()).not.toHaveTextContent("Download CV");
  });

  it("no photo shows initials, not a broken image", async () => {
    setup();
    await screen.findByLabelText(/^Name/);
    expect(preview()).toHaveTextContent("YM");
    expect(preview().querySelector("img")).toBeNull();
  });

  it("Save sends PUT /api/admin/profile with the full body", async () => {
    const user = userEvent.setup();
    vi.mocked(apiSend).mockResolvedValue(profile({ headline: "Staff engineer" }) as never);
    setup();
    const headline = await screen.findByLabelText(/^Headline/);
    await user.clear(headline);
    await user.type(headline, "Staff engineer");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(apiSend).toHaveBeenCalled());
    const [method, url, body] = vi.mocked(apiSend).mock.calls[0] as unknown as [string, string, Record<string, unknown>];
    expect(method).toBe("PUT");
    expect(url).toBe("/api/admin/profile");
    expect(body).toEqual({
      name: "Yazan Maayeh",
      headline: "Staff engineer",
      intro: "I build things.",
      about: "About me",
      location: null,
      email: "me@example.com",
      githubUrl: null,
      linkedinUrl: null,
      available: false,
      availabilityText: null,
      photoKey: null,
      photoAlt: null,
      cvKey: null,
    });
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("photo without alt text blocks saving and shows the error under the alt field", async () => {
    const user = userEvent.setup();
    current = profile({ photoKey: `${"b".repeat(32)}.jpg`, photoAlt: "Me" });
    setup();
    const alt = await screen.findByLabelText(/alt text/i);
    await user.clear(alt);
    await user.type(alt, "x");
    await user.clear(alt);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Add alt text for the photo.")).toBeInTheDocument();
    expect(alt).toHaveAttribute("aria-invalid", "true");
    expect(alt).toHaveAccessibleDescription("Add alt text for the photo.");
    expect(document.getElementById(alt.getAttribute("aria-describedby")!)).toHaveTextContent("Add alt text for the photo.");
    expect(apiSend).not.toHaveBeenCalled();
  });

  it("server fields error shows under the field", async () => {
    const user = userEvent.setup();
    vi.mocked(apiSend).mockRejectedValue(
      new ApiRequestError("Check the form.", 400, "validation", { email: "Use a valid email address." }),
    );
    setup();
    const name = await screen.findByLabelText(/^Name/);
    await user.type(name, "!");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Use a valid email address.")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Email/)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText(/^Email/)).toHaveAccessibleDescription(expect.stringContaining("Use a valid email address."));
    expect(document.getElementById(screen.getByLabelText(/^Email/).getAttribute("aria-describedby")!.split(" ").at(-1)!)).toHaveTextContent("Use a valid email address.");
  });

  it("preserves edits during PUT and awaited refetch, rebasing unchanged fields to the saved response", async () => {
    const user = userEvent.setup();
    const put = deferred<Profile>();
    const refresh = deferred<Profile>();
    vi.mocked(apiSend).mockReturnValueOnce(put.promise);
    const view = setup();
    const name = await screen.findByLabelText(/^Name/);
    await user.clear(name);
    await user.type(name, "Submitted name");
    await user.clear(screen.getByLabelText(/^Headline/));
    await user.type(screen.getByLabelText(/^Headline/), "Submitted headline");
    vi.mocked(apiGet).mockReturnValueOnce(refresh.promise);
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(apiSend).toHaveBeenCalledTimes(1));
    await user.clear(name);
    await user.type(name, "Later name");
    const saved = profile({ name: "Submitted name", headline: "Canonical headline" });
    await act(async () => { put.resolve(saved); });
    await waitFor(() => expect(vi.mocked(apiGet).mock.calls.filter(([url]) => url === "/api/admin/profile")).toHaveLength(2));
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    await user.clear(screen.getByLabelText(/^Intro/));
    await user.type(screen.getByLabelText(/^Intro/), "Later intro");
    await user.click(screen.getByRole("switch", { name: /Available for work/ }));
    await act(async () => { refresh.resolve(saved); });
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeEnabled());
    expect(name).toHaveValue("Later name");
    expect(screen.getByLabelText(/^Intro/)).toHaveValue("Later intro");
    expect(screen.getByRole("switch", { name: /Available for work/ })).toBeChecked();
    expect(screen.getByLabelText(/^Headline/)).toHaveValue("Canonical headline");
    expect(apiSend).toHaveBeenCalledWith("PUT", "/api/admin/profile", expect.objectContaining({ name: "Submitted name", intro: "I build things.", available: false }));
    await user.click(screen.getByRole("link", { name: "Leave test link" }));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(view.location()).toBe("/admin/profile");
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(name).toHaveValue("Submitted name");
    expect(screen.getByLabelText(/^Headline/)).toHaveValue("Canonical headline");
    expect(screen.getByLabelText(/^Intro/)).toHaveValue("I build things.");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("retains a post-submit reversion to the old default through successful refetch", async () => {
    const user = userEvent.setup();
    const put = deferred<Profile>();
    vi.mocked(apiSend).mockReturnValueOnce(put.promise);
    setup();
    const name = await screen.findByLabelText(/^Name/);
    await user.clear(name);
    await user.type(name, "Submitted name");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(apiSend).toHaveBeenCalledTimes(1));
    await user.clear(name);
    await user.type(name, "Yazan Maayeh");
    current = profile({ name: "Submitted name" });
    await act(async () => { put.resolve(current); });
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeEnabled());
    expect(name).toHaveValue("Yazan Maayeh");
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    // Returning to the saved server value must clear dirty, not to the pre-save default.
    await user.clear(name);
    await user.type(name, "Submitted name");
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeDisabled());
  });

  it("retains photo and CV upload completions and alt edits made while saving", async () => {
    const user = userEvent.setup();
    const put = deferred<Profile>();
    const image = deferred<UploadResult>();
    const cv = deferred<UploadResult>();
    const photoKey = `${"c".repeat(32)}.jpg`;
    const cvKey = `${"d".repeat(32)}.pdf`;
    vi.mocked(apiSend).mockReturnValueOnce(put.promise);
    vi.mocked(apiUpload).mockReturnValueOnce(image.promise).mockReturnValueOnce(cv.promise);
    setup();
    const name = await screen.findByLabelText(/^Name/);
    await user.type(name, "!");
    await user.upload(screen.getByTestId("image-input"), new File(["photo"], "photo.jpg", { type: "image/jpeg" }));
    await user.upload(screen.getByTestId("file-input"), new File(["cv"], "cv.pdf", { type: "application/pdf" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(apiSend).toHaveBeenCalledTimes(1));
    await act(async () => {
      image.resolve({ key: photoKey, url: fileUrl(photoKey), contentType: "image/jpeg", size: 5 });
      cv.resolve({ key: cvKey, url: fileUrl(cvKey), contentType: "application/pdf", size: 2 });
    });
    await user.type(await screen.findByLabelText(/alt text/i), "New portrait");
    current = profile({ name: "Yazan Maayeh!" });
    await act(async () => { put.resolve(current); });
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeEnabled());
    expect(screen.getByLabelText(/alt text/i)).toHaveValue("New portrait");
    expect(screen.getByTestId("image-preview")).toHaveAttribute("src", fileUrl(photoKey));
    expect(preview().querySelector("img")).toHaveAttribute("alt", "New portrait");
    expect(preview()).toHaveTextContent("Download CV");
    vi.mocked(apiSend).mockResolvedValueOnce(profile({ name: "Yazan Maayeh!", photoKey, photoAlt: "New portrait", cvKey }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(apiSend).toHaveBeenCalledTimes(2));
    expect(vi.mocked(apiSend).mock.calls[1][2]).toEqual(expect.objectContaining({ photoKey, photoAlt: "New portrait", cvKey }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeDisabled());
  });

  it("keeps a dirty editor and navigation guard on 503 refresh and supports retry without losing edits", async () => {
    const user = userEvent.setup();
    const view = setup();
    const name = await screen.findByLabelText(/^Name/);
    await user.type(name, " draft");
    vi.mocked(apiGet).mockRejectedValueOnce(new ApiRequestError("Unavailable", 503, "server"));
    await user.click(screen.getByRole("button", { name: "Refresh profile" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/refresh/i);
    expect(screen.getByLabelText(/^Name/)).toBe(name);
    expect(name).toHaveValue("Yazan Maayeh draft");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    await user.click(screen.getByRole("link", { name: "Leave test link" }));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(view.location()).toBe("/admin/profile");
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    current = profile({ name: "Refreshed server name" });
    await user.click(screen.getByRole("button", { name: /Retry/i }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(name).toHaveValue("Yazan Maayeh draft");
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  });

  it("shows a blocking error only when the initial load has no profile", async () => {
    vi.mocked(apiGet).mockRejectedValueOnce(new ApiRequestError("Unavailable", 503, "server"));
    setup();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the profile");
    expect(screen.queryByLabelText(/^Name/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("leaving with unsaved edits asks to discard", async () => {
    const user = userEvent.setup();
    const view = setup();
    const name = await screen.findByLabelText(/^Name/);
    await user.type(name, "!");
    await user.click(screen.getByRole("link", { name: "Leave test link" }));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(view.location()).toBe("/admin/profile");
  });
});
