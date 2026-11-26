import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { skipToken, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { ApiRequestError } from "@/lib/api";
import { AdminLayout } from "../AdminLayout";
import { renderWithProviders } from "@/test/render";
import { TextField } from "../form/FormField";
import { ListEditor } from "./ListEditor";
import type { CollectionConfig } from "./types";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiGet: vi.fn(), apiSend: vi.fn() };
});
import { apiGet, apiSend } from "@/lib/api";

type Item = { id: number; name: string; slug: string; isVisible: boolean; sortOrder: number };
type Input = Omit<Item, "id">;

const schema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  isVisible: z.boolean(),
  sortOrder: z.number(),
});

const config: CollectionConfig<Item, Input> = {
  collection: "projects",
  title: "Projects",
  singular: "project",
  schema,
  knownFields: ["name", "slug"],
  conflictField: "slug",
  toInput: ({ id: _id, ...rest }) => rest,
  emptyInput: (sortOrder) => ({ name: "", slug: "", isVisible: false, sortOrder }),
  duplicateInput: (item, _all, sortOrder) => ({
    name: `${item.name} copy`,
    slug: `${item.slug}-copy`,
    isVisible: false,
    sortOrder,
  }),
  rowTitle: (i) => i.name,
  rowSubtitle: (i) => i.slug,
  FormBody: ({ form }) => (
    <>
      <TextField form={form} name="name" label="Name" />
      <TextField form={form} name="slug" label="Slug" />
    </>
  ),
};

const items: Item[] = [
  { id: 1, name: "Alpha", slug: "alpha", isVisible: true, sortOrder: 0 },
  { id: 2, name: "Beta", slug: "beta", isVisible: false, sortOrder: 1 },
  { id: 3, name: "Gamma", slug: "gamma", isVisible: true, sortOrder: 2 },
];

let list: Item[];
let summary: { toFillIn: unknown[] };

function CacheProbe() {
  // Subscribes to the list cache without fetching, so the test can read it exactly.
  const { data } = useQuery({ queryKey: ["admin", "projects"], queryFn: skipToken });
  return <output data-testid="cache">{JSON.stringify(data ?? null)}</output>;
}
const cache = () => JSON.parse(screen.getByTestId("cache").textContent ?? "null") as Item[];

function setup(path = "/admin/projects") {
  vi.mocked(apiGet).mockImplementation((async (url: string) => {
    if (url === "/api/admin/summary") return summary;
    return list;
  }) as never);
  return renderWithProviders(
    <AdminLayout>
      <ListEditor config={config} />
      <CacheProbe />
    </AdminLayout>,
    { path },
  );
}

const sends = () => vi.mocked(apiSend).mock.calls;
const rowTexts = () => screen.getAllByRole("listitem").map((li) => li.textContent ?? "");

beforeEach(() => {
  list = items.map((i) => ({ ...i }));
  summary = { toFillIn: [] };
  vi.mocked(apiGet).mockReset();
  vi.mocked(apiSend).mockReset();
  vi.mocked(apiSend).mockResolvedValue(undefined as never);
});

async function openMenu(title: string) {
  await userEvent.click(await screen.findByRole("button", { name: `Actions for ${title}` }));
}

describe("ListEditor", () => {
  it("renders rows in sortOrder with titles and subtitles", async () => {
    list = [list[2], list[0], list[1]];
    setup();
    await screen.findByText("Alpha");
    const names = rowTexts();
    expect(names[0]).toContain("Alpha");
    expect(names[1]).toContain("Beta");
    expect(names[2]).toContain("Gamma");
    expect(screen.getByText("gamma")).toBeInTheDocument();
  });

  it("empty state shows copy and an Add button", async () => {
    list = [];
    setup();
    expect(await screen.findByText("No Projects yet.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Add project" }).length).toBeGreaterThan(0);
  });

  it("Move down on row 1 calls PUT /api/admin/<c>/order with ids [2,1,3]", async () => {
    setup();
    await openMenu("Alpha");
    await userEvent.click(await screen.findByRole("menuitem", { name: "Move down" }));
    await waitFor(() => expect(sends()).toContainEqual(["PUT", "/api/admin/projects/order", { ids: [2, 1, 3] }]));
  });

  it("reorder failure shows the optimistic order, then restores the exact previous order and sortOrder", async () => {
    list = [
      { ...items[0], sortOrder: 10 },
      { ...items[1], sortOrder: 20 },
      { ...items[2], sortOrder: 30 },
    ];
    setup();
    await screen.findByText("Alpha");
    await waitFor(() => expect(cache()).toHaveLength(3));
    const before = cache();
    let reject!: (e: Error) => void;
    vi.mocked(apiSend).mockImplementationOnce(() => new Promise((_, rej) => (reject = rej)) as never);
    await openMenu("Alpha");
    await userEvent.click(await screen.findByRole("menuitem", { name: "Move down" }));
    await waitFor(() => expect(rowTexts()[0]).toContain("Beta"));
    expect([0, 1, 2].map((i) => rowTexts()[i])).toEqual([expect.stringContaining("Beta"), expect.stringContaining("Alpha"), expect.stringContaining("Gamma")]);
    expect(cache().map((i) => [i.id, i.sortOrder])).toEqual([
      [2, 0],
      [1, 1],
      [3, 2],
    ]);
    reject(new ApiRequestError("boom", 500, "server"));
    expect(await screen.findByText("Could not save the new order.")).toBeInTheDocument();
    await waitFor(() => expect(cache()).toEqual(before));
    expect(cache().map((i) => [i.id, i.sortOrder])).toEqual([
      [1, 10],
      [2, 20],
      [3, 30],
    ]);
    expect(rowTexts()[0]).toContain("Alpha");
    expect(rowTexts()[1]).toContain("Beta");
    expect(rowTexts()[2]).toContain("Gamma");
  });

  it("switch off sends PUT with isVisible false and the other fields unchanged", async () => {
    setup();
    await userEvent.click(await screen.findByRole("switch", { name: "Show Alpha on the site" }));
    await waitFor(() =>
      expect(sends()).toContainEqual([
        "PUT",
        "/api/admin/projects/1",
        { name: "Alpha", slug: "alpha", isVisible: false, sortOrder: 0 },
      ]),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it('row click opens the panel; Save sends PUT with the edited value then closes and toasts "Saved"', async () => {
    setup();
    await userEvent.click(await screen.findByText("Beta"));
    const name = await screen.findByLabelText("Name");
    await userEvent.clear(name);
    await userEvent.type(name, "Beta 2");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(sends()).toContainEqual([
        "PUT",
        "/api/admin/projects/2",
        { name: "Beta 2", slug: "beta", isVisible: false, sortOrder: 1 },
      ]),
    );
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("server fields error from PUT shows under the field and the panel stays open", async () => {
    setup();
    await userEvent.click(await screen.findByText("Beta"));
    await userEvent.type(await screen.findByLabelText("Name"), "x");
    vi.mocked(apiSend).mockRejectedValueOnce(new ApiRequestError("Bad", 400, "validation", { name: "Name is taken" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Name is taken")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("409 shows the conflict message under the conflictField", async () => {
    setup();
    await userEvent.click(await screen.findByText("Beta"));
    await userEvent.type(await screen.findByLabelText("Slug"), "x");
    vi.mocked(apiSend).mockRejectedValueOnce(new ApiRequestError("Conflict", 409, "conflict"));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("That address is already used.")).toBeInTheDocument();
    expect(screen.getByLabelText("Slug")).toHaveAttribute("aria-invalid", "true");
  });

  it("closing a dirty panel asks to discard; Keep editing keeps it", async () => {
    setup();
    await userEvent.click(await screen.findByText("Beta"));
    await userEvent.type(await screen.findByLabelText("Name"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(await screen.findByText("You have unsaved changes.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    await waitFor(() => expect(screen.queryByText("You have unsaved changes.")).not.toBeInTheDocument());
    expect(screen.getByLabelText("Name")).toHaveValue("Betax");
  });

  it("closing a dirty panel and discarding closes it", async () => {
    setup();
    await userEvent.click(await screen.findByText("Beta"));
    await userEvent.type(await screen.findByLabelText("Name"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Discard changes" }));
    await waitFor(() => expect(screen.queryByLabelText("Name")).not.toBeInTheDocument());
  });

  it("Add creates with POST and sortOrder = max+1", async () => {
    setup();
    await screen.findByText("Alpha");
    await userEvent.click(screen.getAllByRole("button", { name: "Add project" })[0]);
    await userEvent.type(await screen.findByLabelText("Name"), "Delta");
    await userEvent.type(screen.getByLabelText("Slug"), "delta");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(sends()).toContainEqual([
        "POST",
        "/api/admin/projects",
        { name: "Delta", slug: "delta", isVisible: false, sortOrder: 3 },
      ]),
    );
  });

  it("Duplicate POSTs duplicateInput with isVisible false", async () => {
    setup();
    await openMenu("Alpha");
    await userEvent.click(await screen.findByRole("menuitem", { name: "Duplicate" }));
    await waitFor(() =>
      expect(sends()).toContainEqual([
        "POST",
        "/api/admin/projects",
        { name: "Alpha copy", slug: "alpha-copy", isVisible: false, sortOrder: 3 },
      ]),
    );
    expect(await screen.findByText("Copy added (hidden)")).toBeInTheDocument();
  });

  it("Delete asks first; Cancel sends nothing; confirm sends DELETE and removes the row", async () => {
    setup();
    await openMenu("Alpha");
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    expect(await screen.findByText("Delete Alpha? This cannot be undone.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(sends()).toHaveLength(0);

    await openMenu("Alpha");
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    list = list.filter((i) => i.id !== 1);
    await userEvent.click(await screen.findByRole("button", { name: "Delete project" }));
    await waitFor(() => expect(sends()).toContainEqual(["DELETE", "/api/admin/projects/1"]));
    await waitFor(() => expect(screen.queryByText("Alpha")).not.toBeInTheDocument());
  });

  it("?edit=2 opens the panel for row 2", async () => {
    setup("/admin/projects?edit=2");
    expect(await screen.findByLabelText("Name")).toHaveValue("Beta");
  });

  it("?new=1 opens an empty panel", async () => {
    setup("/admin/projects?new=1");
    expect(await screen.findByLabelText("Name")).toHaveValue("");
  });

  it('"To fill in" badge appears for rows listed in the summary', async () => {
    summary = { toFillIn: [{ section: "projects", id: 2, field: "summary", label: "Summary" }] };
    setup();
    await screen.findByText("Beta");
    const badges = await screen.findAllByText("To fill in");
    expect(badges).toHaveLength(1);
    expect(badges[0].closest("li")).toHaveTextContent("Beta");
  });

  describe("unsaved guard on panel switches", () => {
    async function openDirtyBeta(path = "/admin/projects") {
      const r = setup(path);
      if (path === "/admin/projects") await userEvent.click(await screen.findByText("Beta"));
      await userEvent.type(await screen.findByLabelText("Name"), "x");
      return r;
    }
    const keepEditing = async () => {
      expect(await screen.findByText("You have unsaved changes.")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Keep editing" }));
      await waitFor(() => expect(screen.queryByText("You have unsaved changes.")).not.toBeInTheDocument());
    };

    it("switching rows via ?edit while dirty asks first; Keep editing keeps the edits", async () => {
      const r = await openDirtyBeta("/admin/projects?edit=2");
      r.navigate("/admin/projects?edit=1");
      await keepEditing();
      expect(screen.getByLabelText("Name")).toHaveValue("Betax");
      expect(r.location()).toBe("/admin/projects?edit=2");
      r.navigate("/admin/projects?edit=1");
      await userEvent.click(await screen.findByRole("button", { name: "Discard changes" }));
      await waitFor(() => expect(screen.getByLabelText("Name")).toHaveValue("Alpha"));
      expect(r.location()).toBe("/admin/projects?edit=1");
    });

    it("clicking another row while dirty asks first", async () => {
      await openDirtyBeta();
      fireEvent.click(screen.getByText("Alpha", { selector: "span" }));
      await keepEditing();
      expect(screen.getByLabelText("Name")).toHaveValue("Betax");
    });

    it("Add while dirty asks first", async () => {
      await openDirtyBeta();
      fireEvent.click(screen.getAllByRole("button", { name: "Add project", hidden: true })[0]);
      await keepEditing();
      expect(screen.getByLabelText("Name")).toHaveValue("Betax");
    });

    it("?new=1 while dirty asks first", async () => {
      const r = await openDirtyBeta();
      r.navigate("/admin/projects?new=1");
      await keepEditing();
      expect(screen.getByLabelText("Name")).toHaveValue("Betax");
      expect(r.location()).toBe("/admin/projects?edit=2");
    });

    it("a clean panel follows URL changes without asking", async () => {
      const r = setup("/admin/projects?edit=2");
      await screen.findByLabelText("Name");
      r.navigate("/admin/projects?edit=1");
      await waitFor(() => expect(screen.getByLabelText("Name")).toHaveValue("Alpha"));
      expect(screen.queryByText("You have unsaved changes.")).not.toBeInTheDocument();
    });
  });
});
