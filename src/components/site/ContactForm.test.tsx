import { readFileSync } from "node:fs";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiSend } from "@/lib/api";
import { siteCopy } from "@/content/copy";
import { ContactForm } from "./ContactForm";
import { makeApiError } from "@/test/utils";
vi.mock("@/lib/api", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/api")>(), apiSend: vi.fn() }));
const send = vi.mocked(apiSend);
const values = { name: "Ada Lovelace", email: "ada@example.com", subject: "A project", message: "Build a site" };
function fill(subject = values.subject) {
  for (const [key, value] of Object.entries({ ...values, subject })) fireEvent.change(screen.getByLabelText(siteCopy.contact.labels[key as keyof typeof values]), { target: { value } });
}
function form() { return screen.getByRole("button", { name: siteCopy.contact.submit }).closest("form")!; }
function deferred() { let resolve!: (value: { ok: true }) => void; const promise = new Promise<{ ok: true }>(r => { resolve = r; }); return { promise, resolve }; }
beforeEach(() => { send.mockReset(); });
afterEach(() => { vi.restoreAllMocks(); });
describe("ContactForm", () => {
  it("renders an empty polite status region that is never display:none", () => {
    render(<ContactForm />);
    const status = screen.getByRole("status");
    expect(status).toBeEmptyDOMElement();
    expect(status).not.toHaveAttribute("hidden");
    expect(status).toHaveAttribute("aria-live", "polite");
    const css = readFileSync("src/components/site/site.css", "utf8");
    expect(css).not.toMatch(/form__status:empty\s*\{[^}]*display:\s*none/);
  });
  it("posts the exact MessageInput and waits for ok before clearing fields and announcing sent", async () => {
    const pending = deferred(); send.mockReturnValue(pending.promise);
    render(<ContactForm />); fill(); fireEvent.submit(form());
    expect(send).toHaveBeenCalledExactlyOnceWith("POST", "/api/messages", { ...values, website: "" });
    expect(screen.getByRole("button")).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByText(siteCopy.contact.sent)).toBeNull();
    expect(screen.getByLabelText("Name")).toHaveValue(values.name);
    await act(async () => pending.resolve({ ok: true }));
    expect(screen.getByRole("status")).toHaveTextContent(siteCopy.contact.sent);
    for (const label of Object.values(siteCopy.contact.labels)) expect(screen.getByLabelText(label)).toHaveValue("");
    expect(screen.getByRole("button")).not.toHaveAttribute("aria-disabled");
  });
  it("validates locally with editable copy instead of browser-generated messages", async () => {
    render(<ContactForm />); fireEvent.submit(form());
    expect(send).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(siteCopy.contact.invalidForm);
    expect(screen.getByLabelText("Name")).toHaveAttribute("aria-invalid", "true");
  });
  it("omits an empty subject key", async () => {
    send.mockResolvedValue({ ok: true }); render(<ContactForm />); fill(""); fireEvent.submit(form());
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(siteCopy.contact.sent));
    const { subject: _, ...required } = values;
    expect(send).toHaveBeenCalledExactlyOnceWith("POST", "/api/messages", { ...required, website: "" });
  });
  it("locks synchronous submit events and rapid clicks before a render", async () => {
    const pending = deferred(); send.mockReturnValue(pending.promise); render(<ContactForm />); fill();
    const target = form(); const button = screen.getByRole("button");
    act(() => { button.click(); button.click(); fireEvent.submit(target); fireEvent.submit(target); });
    expect(send).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve({ ok: true }));
  });
  it("binds API validation errors to fields and focuses the first failing field", async () => {
    send.mockRejectedValue(makeApiError({ status: 400, code: "validation", fields: { email: "Write an email address with an @", message: "Write a message" } }));
    render(<ContactForm />); fill(); fireEvent.submit(form());
    for (const [label, error] of [["Email", "Write an email address with an @"], ["Message", "Write a message"]]) {
      const node = await screen.findByText(error); const input = screen.getByLabelText(label);
      expect(node).toHaveClass("field__error"); expect(input).toHaveAttribute("aria-describedby", node.id);
      expect(input).toHaveAttribute("aria-invalid", "true");
    }
    expect(screen.getByLabelText("Email")).toHaveFocus();
    expect(screen.queryByText(siteCopy.contact.sent)).toBeNull();
    for (const [key, value] of Object.entries(values)) expect(screen.getByLabelText(siteCopy.contact.labels[key as keyof typeof values])).toHaveValue(value);
  });
  it.each([
    ["rate limit", makeApiError({ status: 429, code: "rate_limited" }), siteCopy.contact.rateLimited],
    ["network rejection", new TypeError("Failed to fetch"), siteCopy.contact.networkError],
    ["wrapped network rejection", makeApiError({ status: 0 }), siteCopy.contact.networkError],
    ["server error", makeApiError(), siteCopy.contact.networkError],
  ])("announces %s without success or losing values", async (_, error, text) => {
    send.mockRejectedValue(error); render(<ContactForm />); fill(); fireEvent.submit(form());
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(text));
    expect(screen.queryByText(siteCopy.contact.sent)).toBeNull();
    expect(document.querySelector('[aria-invalid="true"]')).toBeNull();
    for (const [key, value] of Object.entries(values)) expect(screen.getByLabelText(siteCopy.contact.labels[key as keyof typeof values])).toHaveValue(value);
    expect(screen.getByRole("button")).toBeEnabled();
  });
  it("announces errors for unknown server field keys", async () => {
    send.mockRejectedValue(makeApiError({ status: 400, fields: { website: "Cannot send this message" } }));
    render(<ContactForm />); fill(); fireEvent.submit(form());
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(siteCopy.contact.invalidForm));
  });
  it("does not announce success for a response without ok true", async () => {
    send.mockResolvedValue({ ok: false }); render(<ContactForm />); fill(); fireEvent.submit(form());
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(siteCopy.contact.networkError));
    expect(screen.getByLabelText("Name")).toHaveValue(values.name);
  });
  it("uses visible labels and native required, maxLength, email and autocomplete semantics", () => {
    render(<ContactForm />);
    for (const [field, max] of [["name", 100], ["email", 200], ["subject", 150], ["message", 5000]] as const) {
      const input = screen.getByLabelText(siteCopy.contact.labels[field]);
      expect(input).toHaveAttribute("maxlength", String(max));
      expect(input.closest(".field")?.querySelector("label")).toBeVisible();
      if (field === "subject") expect(input).not.toBeRequired(); else expect(input).toBeRequired();
    }
    expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email");
    expect(screen.getByLabelText("Email")).toHaveAttribute("autocomplete", "email");
    expect(screen.getByLabelText("Name")).toHaveAttribute("autocomplete", "name");
    expect(form().noValidate).toBe(true);
  });
  it("hides the honeypot and its label from keyboard and assistive technology", () => {
    const { container } = render(<ContactForm />); const trap = container.querySelector<HTMLInputElement>('input[name="website"]')!;
    expect(trap).toHaveAttribute("tabindex", "-1"); expect(trap).toHaveAttribute("autocomplete", "off");
    const wrapper = trap.closest('[aria-hidden="true"]')!; expect(wrapper).not.toBeVisible();
    expect(wrapper.querySelector("label")).not.toBeVisible();
    expect(screen.queryByRole("textbox", { name: "Website" })).toBeNull();
  });
  it("no state update or reset after unmount on success", async () => {
    const pending = deferred(); send.mockReturnValue(pending.promise);
    const reset = vi.spyOn(HTMLFormElement.prototype, "reset"); const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = render(<ContactForm />); fill(); fireEvent.submit(form());
    unmount(); await act(async () => pending.resolve({ ok: true }));
    expect(reset).not.toHaveBeenCalled(); expect(errors).not.toHaveBeenCalled();
  });
  it("no state update or focus after unmount on network failure", async () => {
    let reject!: (e: unknown) => void; send.mockReturnValue(new Promise((_, r) => { reject = r; }));
    const focus = vi.spyOn(HTMLElement.prototype, "focus"); const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = render(<ContactForm />); fill(); fireEvent.submit(form());
    unmount(); await act(async () => reject(makeApiError({ status: 400, code: "validation", fields: { email: "Bad" } })));
    expect(focus).not.toHaveBeenCalled(); expect(errors).not.toHaveBeenCalled();
  });
});
