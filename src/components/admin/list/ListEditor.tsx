import { useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useLocation, useSearch } from "wouter";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAdminList, useAdminSummary, useDeleteItem, useReorder, useSaveItem } from "@/lib/admin/queries";
import { useGuardedAction } from "@/lib/admin/unsaved";
import "../lists.css";
import { EditPanel } from "./EditPanel";
import { moveId, nextSortOrder } from "./reorder";
import { SortableRow } from "./SortableRow";
import type { CollectionConfig, Row } from "./types";

type Panel = { kind: "edit"; id: number } | { kind: "new" } | null;

function panelFromSearch(search: string): Panel {
  const params = new URLSearchParams(search);
  if (params.get("new") === "1") return { kind: "new" };
  if (params.has("edit")) {
    const id = Number(params.get("edit"));
    if (Number.isInteger(id)) return { kind: "edit", id };
  }
  return null;
}

function samePanel(a: Panel, b: Panel): boolean {
  if (a === null || b === null) return a === b;
  return a.kind === b.kind && (a.kind === "new" || (b.kind === "edit" && a.id === b.id));
}

const emptyText: Record<string, string> = {
  projects: "No projects yet.",
  experience: "No jobs yet.",
  education: "No education yet.",
  skills: "No skills yet.",
};

export function ListEditor<T extends Row, I>({ config }: { config: CollectionConfig<T, I> }) {
  const { collection, title, singular } = config;
  const list = useAdminList<T>(collection);
  const summary = useAdminSummary();
  const save = useSaveItem<T, I>(collection);
  const remove = useDeleteItem(collection);
  const reorder = useReorder(collection);
  const qc = useQueryClient();
  const guarded = useGuardedAction();
  const returnFocus = useRef<HTMLElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [location, navigate] = useLocation();
  const search = useSearch();

  // The open item is component state. The URL is read on first load and when the user navigates
  // (back/forward, a link); every switch away from a dirty panel goes through the unsaved guard.
  const [panel, setPanel] = useState<Panel>(() => panelFromSearch(search));
  const panelRef = useRef<Panel>(panel);
  const [toDelete, setToDelete] = useState<T | null>(null);

  const urlFor = (p: Panel) => (p?.kind === "edit" ? `${location}?edit=${p.id}` : p?.kind === "new" ? `${location}?new=1` : location);

  // Updates state and URL together, with no confirmation.
  const apply = (next: Panel) => {
    panelRef.current = next;
    setPanel(next);
    navigate(urlFor(next), { replace: true });
  };

  // User actions: ask first when the open panel is dirty.
  const open = (next: Panel, trigger?: HTMLElement | null) => {
    if (samePanel(next, panelRef.current)) return;
    returnFocus.current = trigger ?? (document.activeElement as HTMLElement | null);
    guarded(() => apply(next));
  };
  // Menu items are gone by the time a dialog closes, so Radix cannot return focus to them.
  // Send focus to the saved trigger, or to the page heading when its row no longer exists.
  const restoreFocus = (event: Event) => {
    event.preventDefault();
    const el = returnFocus.current;
    (el && el.isConnected ? el : headingRef.current)?.focus();
  };
  const close = () => apply(null);

  useEffect(() => {
    const target = panelFromSearch(search);
    const current = panelRef.current;
    if (samePanel(target, current)) return;
    // The URL changed under us: put it back first, then ask. Discard applies the target.
    navigate(urlFor(current), { replace: true });
    guarded(() => apply(target));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const rows = useMemo(() => [...(list.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder), [list.data]);
  const next = nextSortOrder(rows);

  const fillIn = useMemo(() => {
    const ids = new Set<number>();
    for (const f of summary.data?.toFillIn ?? []) {
      if (f.section === collection && f.id !== null) ids.add(f.id);
    }
    return ids;
  }, [summary.data, collection]);

  const move = (from: number, to: number) => {
    if (from === to) return;
    const ids = moveId(
      rows.map((r) => r.id),
      from,
      to,
    );
    if (reorder.isPending) return;
    reorder.mutate(
      { ids },
      {
        onError: () => toast.error("Could not save the new order."),
        // Success or failure, show the order the server has.
        onSettled: () => void qc.invalidateQueries({ queryKey: ["admin", collection] }),
      },
    );
  };

  const toggleVisible = (item: T, visible: boolean) => {
    save.mutate(
      { id: item.id, input: { ...config.toInput(item), isVisible: visible } },
      { onError: () => toast.error("Could not change visibility.") },
    );
  };

  const duplicate = (item: T) => {
    save.mutate(
      { input: config.duplicateInput(item, rows, next) },
      {
        onSuccess: () => toast.success("Copy added (hidden)"),
        onError: () => toast.error("Could not duplicate."),
      },
    );
  };

  const confirmDelete = () => {
    const item = toDelete;
    if (!item) return;
    setToDelete(null);
    remove.mutate(
      { id: item.id },
      {
        onSuccess: () => {
          toast.success("Deleted");
          if (panel?.kind === "edit" && panel.id === item.id) close();
        },
        onError: () => toast.error("Could not delete."),
      },
    );
  };

  const editing = panel?.kind === "edit" ? (rows.find((r) => r.id === panel.id) ?? null) : null;
  const sheetOpen = panel?.kind === "new" || (panel?.kind === "edit" && editing !== null);

  const addButton = (
    <Button type="button" onClick={(e) => open({ kind: "new" }, e.currentTarget)}>
      <Plus className="mr-1 h-4 w-4" aria-hidden />
      Add {singular}
    </Button>
  );

  return (
    <section aria-labelledby="list-title" className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <h1 id="list-title" ref={headingRef} tabIndex={-1} className="text-lg font-semibold text-foreground outline-none">
          {title}
          {list.data && <span className="ml-2 text-sm font-normal text-muted-foreground">{rows.length}</span>}
        </h1>
        {rows.length > 0 && addButton}
      </header>

      <p className="admin-page-intro">{collection === "projects" ? "Hidden projects stay off the site." : "Use the arrows to change the order."}</p>
      {list.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {list.isError && (
        <p role="alert" className="text-sm text-destructive">
          Could not load {title}.{" "}
          <button type="button" className="underline" onClick={() => void list.refetch()}>
            Try again
          </button>
        </p>
      )}

      {list.data && rows.length === 0 && (
        <div className="flex flex-col items-start gap-3 border-y border-border py-6">
          <p className="text-sm text-muted-foreground">{emptyText[collection]}</p>
          {addButton}
        </div>
      )}

      {rows.length > 0 && (
        <>
            <ul className="border-t border-border">
              {rows.map((item, i) => (
                <SortableRow
                  key={item.id}
                  id={item.id}
                  title={config.rowTitle(item)}
                  subtitle={config.rowSubtitle(item)}
                  featured={"featured" in item && Boolean(item.featured)}
                  thumbnail={"imageKey" in item && typeof item.imageKey === "string" ? `/api/files/${encodeURIComponent(item.imageKey)}` : null}
                  isVisible={item.isVisible}
                  toFillIn={fillIn.has(item.id)}
                  isFirst={i === 0}
                  isLast={i === rows.length - 1}
                  reordering={reorder.isPending}
                  onOpen={(t) => open({ kind: "edit", id: item.id }, t)}
                  onToggleVisible={(v) => toggleVisible(item, v)}
                  onMoveUp={() => move(i, i - 1)}
                  onMoveDown={() => move(i, i + 1)}
                  onDuplicate={() => duplicate(item)}
                  onDelete={(t) => {
                    returnFocus.current = t ?? null;
                    setToDelete(item);
                  }}
                />
              ))}
            </ul>
        </>
      )}

      <Sheet open={sheetOpen} onOpenChange={(o) => !o && guarded(close)}>
        <SheetContent side="right" onCloseAutoFocus={restoreFocus} className="admin-edit-sheet flex w-full flex-col gap-0 p-0 sm:max-w-xl">
          <SheetHeader className="border-b border-border px-4 py-3">
            <SheetTitle>{editing ? `Edit ${singular}` : `Add ${singular}`}</SheetTitle>
            <SheetDescription className="sr-only">
              {editing ? `Change the details of this ${singular}.` : `Fill in the details of the new ${singular}.`}
            </SheetDescription>
          </SheetHeader>
          {sheetOpen && (
            <EditPanel
              key={editing?.id ?? "new"}
              config={config}
              item={editing}
              nextSortOrder={next}
              onSaved={close}
            />
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={toDelete !== null} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent onCloseAutoFocus={restoreFocus}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {toDelete ? `Delete ${config.rowTitle(toDelete)}? This cannot be undone.` : ""}
            </AlertDialogTitle>
            <AlertDialogDescription className="sr-only">This removes the {singular} for good.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmDelete}>Delete {singular}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
