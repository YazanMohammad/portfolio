import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/render";
import { GuardedLink, UnsavedProvider, useSaveShortcut, useUnsavedGuard } from "./unsaved";

function Form({ dirty }: { dirty: boolean }) {
  useUnsavedGuard("f1", dirty);
  return <GuardedLink to="/admin/projects">Go projects</GuardedLink>;
}

function setup(dirty: boolean) {
  return renderWithProviders(
    <UnsavedProvider>
      <Form dirty={dirty} />
    </UnsavedProvider>,
    { path: "/admin/profile" },
  );
}

describe("unsaved guard", () => {
  it("blocks navigation when a form is dirty", async () => {
    const { location } = setup(true);
    await userEvent.click(screen.getByRole("link", { name: "Go projects" }));
    expect(await screen.findByText("You have unsaved changes.")).toBeInTheDocument();
    expect(location()).toBe("/admin/profile");
    await userEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(location()).toBe("/admin/profile");
    await userEvent.click(screen.getByRole("link", { name: "Go projects" }));
    await userEvent.click(await screen.findByRole("button", { name: "Discard changes" }));
    expect(location()).toBe("/admin/projects");
  });

  it("navigates immediately when clean", async () => {
    const { location } = setup(false);
    await userEvent.click(screen.getByRole("link", { name: "Go projects" }));
    expect(location()).toBe("/admin/projects");
    expect(screen.queryByText("You have unsaved changes.")).not.toBeInTheDocument();
  });

  it("registers beforeunload only while dirty", () => {
    const dirty = setup(true);
    const e1 = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(e1);
    expect(e1.defaultPrevented).toBe(true);
    dirty.unmount();
    setup(false);
    const e2 = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(e2);
    expect(e2.defaultPrevented).toBe(false);
  });
});

function Shortcut({ onSave, enabled = true }: { onSave: () => void; enabled?: boolean }) {
  useSaveShortcut(onSave, enabled);
  return null;
}

describe("useSaveShortcut", () => {
  it("Ctrl+S and Cmd+S call onSave and prevent the browser dialog", () => {
    const onSave = vi.fn();
    render(<Shortcut onSave={onSave} />);
    const ctrl = new KeyboardEvent("keydown", { key: "s", ctrlKey: true, cancelable: true, bubbles: true });
    document.dispatchEvent(ctrl);
    const meta = new KeyboardEvent("keydown", { key: "S", metaKey: true, cancelable: true, bubbles: true });
    document.dispatchEvent(meta);
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(ctrl.defaultPrevented).toBe(true);
    expect(meta.defaultPrevented).toBe(true);
  });

  it("is ignored when enabled is false", () => {
    const onSave = vi.fn();
    render(<Shortcut onSave={onSave} enabled={false} />);
    const ev = new KeyboardEvent("keydown", { key: "s", ctrlKey: true, cancelable: true, bubbles: true });
    fireEvent(document, ev);
    expect(onSave).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(false);
  });
});
