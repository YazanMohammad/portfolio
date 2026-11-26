import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ProjectInput } from "@shared/index";
import { ApiRequestError } from "@/lib/api";
import { UnsavedProvider } from "@/lib/admin/unsaved";
import { TextField } from "./FormField";
import { SaveBar } from "./SaveBar";
import { applyServerError } from "./server-errors";

function Harness() {
  const form = useForm<z.input<typeof ProjectInput>>({
    resolver: zodResolver(ProjectInput) as unknown as Resolver<z.input<typeof ProjectInput>, unknown>,
    defaultValues: { title: "" },
  });
  return (
    <form onSubmit={form.handleSubmit(() => {})} noValidate>
      <TextField form={form} name="title" label="Title" required />
      <button type="submit">Go</button>
    </form>
  );
}

describe("fields", () => {
  it("client validation error shows under the field", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Go" }));
    const input = screen.getByLabelText("Title (required)");
    expect(input).toHaveAttribute("aria-invalid", "true");
    const ids = input.getAttribute("aria-describedby")!.split(" ");
    const msg = ids.map((i) => document.getElementById(i)).find((el) => el?.textContent);
    expect(msg?.textContent).toMatch(/\S/);
  });
  it("labels are associated", () => {
    render(<Harness />);
    expect(screen.getByLabelText("Title (required)").tagName).toBe("INPUT");
  });
});

describe("applyServerError", () => {
  const err = (code: ConstructorParameters<typeof ApiRequestError>[2], fields?: Record<string, string>) =>
    new ApiRequestError("Bad", code === "conflict" ? 409 : 400, code, fields);
  it("server fields map to the matching inputs", () => {
    const setError = vi.fn();
    const out = applyServerError(err("validation", { title: "Too long", "bullets.2": "Too long" }), setError, {
      knownFields: ["title", "bullets.2"],
    });
    expect(setError).toHaveBeenCalledWith("title", { type: "server", message: "Too long" });
    expect(setError).toHaveBeenCalledWith("bullets.2", { type: "server", message: "Too long" });
    expect(out).toBeNull();
  });
  it("unknown server field goes to the form-level message", () => {
    const out = applyServerError(err("validation", { nope: "x" }), vi.fn(), { knownFields: ["title"] });
    expect(out).toContain("x");
  });
  it("unknown field goes to the form message with its key", () => {
    const setError = vi.fn();
    const out = applyServerError(err("validation", { nope: "Bad value." }), setError, { knownFields: ["title"] });
    expect(setError).not.toHaveBeenCalled();
    expect(out).toBe("nope: Bad value.");
  });
  it("nested path not in knownFields goes to the form message", () => {
    const setError = vi.fn();
    const out = applyServerError(err("validation", { "bullets.99": "Too long." }), setError, { knownFields: ["bullets"] });
    expect(setError).not.toHaveBeenCalled();
    expect(out).toBe("bullets.99: Too long.");
  });
  it("409 conflict is shown under the slug field", () => {
    const setError = vi.fn();
    const out = applyServerError(err("conflict"), setError, { conflictField: "slug", knownFields: [] });
    expect(setError).toHaveBeenCalledWith("slug", { type: "server", message: "That address is already used." });
    expect(out).toBeNull();
  });
  it("non-API error returns the generic message", () => {
    expect(applyServerError(new Error("boom"), vi.fn(), { knownFields: [] })).toBe("Could not save. Check your connection and try again.");
  });
});

function Bar({ dirty = true, onSave }: { dirty?: boolean; onSave: () => void }) {
  const [saving, setSaving] = useState(false);
  return (
    <UnsavedProvider>
      <SaveBar
        formId="t"
        dirty={dirty}
        saving={saving}
        formError={null}
        onSave={() => {
          setSaving(true);
          onSave();
        }}
        onDiscard={() => {}}
      />
    </UnsavedProvider>
  );
}

describe("SaveBar", () => {
  it("Save is disabled until the form is dirty", () => {
    render(<Bar dirty={false} onSave={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.queryByText("Discard changes")).toBeNull();
  });
  it("double click on Save calls onSave once while saving", async () => {
    const onSave = vi.fn();
    render(<Bar onSave={onSave} />);
    await userEvent.dblClick(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  });
  it("save works again after a void onSave", async () => {
    const onSave = vi.fn();
    render(
      <UnsavedProvider>
        <SaveBar formId="t" dirty saving={false} formError={null} onSave={onSave} onDiscard={() => {}} />
      </UnsavedProvider>,
    );
    const btn = screen.getByRole("button", { name: "Save" });
    await userEvent.click(btn);
    await new Promise((r) => setTimeout(r, 5));
    await userEvent.click(btn);
    expect(onSave).toHaveBeenCalledTimes(2);
  });
  it("Ctrl+S saves once", () => {
    const onSave = vi.fn();
    render(<Bar onSave={onSave} />);
    fireEvent.keyDown(document, { key: "s", ctrlKey: true });
    expect(onSave).toHaveBeenCalledTimes(1);
  });
  it("Ctrl+S held (two keydown events) calls onSave once while saving", () => {
    const onSave = vi.fn();
    render(<Bar onSave={onSave} />);
    fireEvent.keyDown(document, { key: "s", ctrlKey: true });
    fireEvent.keyDown(document, { key: "s", ctrlKey: true, repeat: true });
    expect(onSave).toHaveBeenCalledTimes(1);
  });
  it("shows the form-level error as an alert", () => {
    render(
      <UnsavedProvider>
        <SaveBar formId="t" dirty saving={false} formError="Nope" onSave={() => {}} onDiscard={() => {}} />
      </UnsavedProvider>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Nope");
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  });
});
