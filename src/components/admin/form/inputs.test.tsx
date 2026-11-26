import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { ApiRequestError } from "@/lib/api";
import { TagsInput } from "./TagsInput";
import { MonthYearField } from "./MonthYearField";
import { BulletsField } from "./BulletsField";
import { ImageDropZone } from "./ImageDropZone";
import { FileField } from "./FileField";
import { MarkdownEditor } from "./MarkdownEditor";
import { MarkdownPreview } from "./MarkdownPreview";
import { ProjectInput } from "@shared/index";
import { TAG_MAX_COUNT, TAG_MAX_LENGTH } from "./TagsInput";

// A plain wrapper (not vi.fn) so a rejected upload is not reported as an unhandled rejection by the mock tracker.
const uploadState = vi.hoisted(() => ({
  calls: [] as unknown[][],
  impl: (async () => undefined) as (...a: unknown[]) => Promise<unknown>,
}));
vi.mock("@/lib/api", async (orig) => {
  const actual = await orig<typeof import("@/lib/api")>();
  return {
    ...actual,
    apiUpload: (...a: unknown[]) => {
      uploadState.calls.push(a);
      return uploadState.impl(...a);
    },
    fileUrl: (k: string) => `/api/files/${k}`,
  };
});
const upload = {
  mockReset: () => {
    uploadState.calls.length = 0;
  },
  mockResolvedValue: (v: unknown) => {
    uploadState.impl = async () => v;
  },
  mockImplementation: (f: () => Promise<unknown>) => {
    uploadState.impl = f;
  },
};

/* eslint-disable @typescript-eslint/no-explicit-any */
function Harness({ defaults, errors, children }: { defaults: any; errors?: any; children: (f: any) => React.ReactNode }) {
  const form = useForm({ defaultValues: defaults });
  const f = { ...form, formState: { ...form.formState, errors: errors ?? form.formState.errors } };
  return (
    <>
      {children(f)}
      <output data-testid="value">{JSON.stringify(form.watch())}</output>
    </>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */
const val = () => JSON.parse(screen.getByTestId("value").textContent!);

beforeEach(() => {
  upload.mockReset();
  upload.mockResolvedValue(undefined);
});

describe("TagsInput", () => {
  const setup = (tags: string[] = [], max = 20) =>
    render(<Harness defaults={{ tags }}>{(f) => <TagsInput form={f} name="tags" label="Tags" max={max} />}</Harness>);
  it("Enter adds a tag", async () => {
    setup();
    await userEvent.type(screen.getByLabelText("Tags"), "react{Enter}");
    expect(val().tags).toEqual(["react"]);
  });
  it("comma adds a tag", async () => {
    setup();
    await userEvent.type(screen.getByLabelText("Tags"), "vue,");
    expect(val().tags).toEqual(["vue"]);
  });
  it("duplicate ignored (case-insensitive)", async () => {
    setup(["React"]);
    await userEvent.type(screen.getByLabelText("Tags"), "react{Enter}");
    expect(val().tags).toEqual(["React"]);
  });
  it("Backspace on empty input removes the last tag", async () => {
    setup(["a", "b"]);
    await userEvent.type(screen.getByLabelText("Tags"), "{Backspace}");
    expect(val().tags).toEqual(["a"]);
  });
  it("remove button removes a tag", async () => {
    setup(["a", "b"]);
    await userEvent.click(screen.getByRole("button", { name: "Remove a" }));
    expect(val().tags).toEqual(["b"]);
  });
  it("stops at max 20 and says so", async () => {
    setup(Array.from({ length: 20 }, (_, i) => `t${i}`));
    expect(screen.getByText("Maximum of 20 tags reached.")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Tags"), "extra{Enter}");
    expect(val().tags).toHaveLength(20);
  });
});

describe("TagsInput limits and focus", () => {
  const setup = (tags: string[] = [], max = 20) =>
    render(<Harness defaults={{ tags }}>{(f) => <TagsInput form={f} name="tags" label="Tags" max={max} />}</Harness>);
  const base = {
    title: "t", summary: "s", description: "d", category: "c", status: "published", featured: false,
  } as Record<string, unknown>;
  const techOk = (technologies: string[]) => {
    const r = ProjectInput.safeParse({ ...base, technologies });
    return !r.success && r.error.issues.some((i) => i.path[0] === "technologies") ? false : true;
  };
  it("limits are pinned to the shared schema", () => {
    expect(techOk(["a".repeat(TAG_MAX_LENGTH)])).toBe(true);
    expect(techOk(["a".repeat(TAG_MAX_LENGTH + 1)])).toBe(false);
    expect(techOk(Array.from({ length: TAG_MAX_COUNT }, (_, i) => `t${i}`))).toBe(true);
    expect(techOk(Array.from({ length: TAG_MAX_COUNT + 1 }, (_, i) => `t${i}`))).toBe(false);
  });
  it("input has a visible focus ring", () => {
    setup();
    const cls = screen.getByLabelText("Tags").parentElement!.className + " " + screen.getByLabelText("Tags").className;
    expect(cls).toMatch(/focus-(within|visible):ring-2/);
    expect(cls).toMatch(/ring-ring/);
    expect(cls).toMatch(/ring-offset-2/);
    expect(cls).not.toMatch(/ring-0/);
  });
  it("at max count Backspace removes the last tag", async () => {
    setup(Array.from({ length: 20 }, (_, i) => `t${i}`));
    const input = screen.getByLabelText("Tags");
    expect(input).not.toBeDisabled();
    await userEvent.type(input, "extra{Enter}");
    expect(val().tags).toHaveLength(20);
    await userEvent.type(input, "{Backspace}");
    expect(val().tags).toHaveLength(19);
  });
});

describe("MonthYearField reset of partial state", () => {
  const run = async (pick: "month" | "year") => {
    let reset: () => void = () => {};
    render(
      <Harness defaults={{ d: null }}>
        {(f) => {
          reset = () => f.reset({ d: null });
          return <MonthYearField form={f} name="d" label="Start" />;
        }}
      </Harness>,
    );
    if (pick === "month") await userEvent.selectOptions(screen.getByLabelText("Start month"), "09");
    else await userEvent.selectOptions(screen.getByLabelText("Start year"), "2024");
    expect(val().d).toBeNull();
    await act(async () => reset());
    await waitFor(() => {
      expect(screen.getByLabelText("Start month")).toHaveValue("");
      expect(screen.getByLabelText("Start year")).toHaveValue("");
    });
  };
  it("month-only partial then reset to null clears the month", () => run("month"));
  it("year-only partial then reset to null clears the year", () => run("year"));
});

describe("MonthYearField sync", () => {
  it("external reset to null clears the shown date", async () => {
    let reset: () => void = () => {};
    render(
      <Harness defaults={{ d: null }}>
        {(f) => {
          reset = () => f.setValue("d", null);
          return <MonthYearField form={f} name="d" label="Start" />;
        }}
      </Harness>,
    );
    await userEvent.selectOptions(screen.getByLabelText("Start month"), "09");
    await userEvent.selectOptions(screen.getByLabelText("Start year"), "2024");
    expect(val().d).toBe("2024-09");
    await act(async () => reset());
    await waitFor(() => expect(screen.getByLabelText("Start month")).toHaveValue(""));
    expect(screen.getByLabelText("Start year")).toHaveValue("");
  });
  it("partial date can be cleared", async () => {
    render(<Harness defaults={{ d: null }}>{(f) => <MonthYearField form={f} name="d" label="Start" />}</Harness>);
    await userEvent.selectOptions(screen.getByLabelText("Start month"), "09");
    const clear = screen.getByRole("button", { name: "Clear Start" });
    expect(clear).toBeEnabled();
    await userEvent.click(clear);
    expect(screen.getByLabelText("Start month")).toHaveValue("");
  });
});

describe("MonthYearField", () => {
  const setup = (props: { disabled?: boolean; value?: string | null } = {}) =>
    render(
      <Harness defaults={{ d: props.value ?? null }}>
        {(f) => <MonthYearField form={f} name="d" label="Start" disabled={props.disabled} />}
      </Harness>,
    );
  it('choosing month and year sets "2024-09"', async () => {
    setup();
    await userEvent.selectOptions(screen.getByLabelText("Start month"), "09");
    expect(val().d).toBeNull();
    await userEvent.selectOptions(screen.getByLabelText("Start year"), "2024");
    expect(val().d).toBe("2024-09");
  });
  it("Clear sets null", async () => {
    setup({ value: "2024-09" });
    await userEvent.click(screen.getByRole("button", { name: "Clear Start" }));
    expect(val().d).toBeNull();
  });
  it("disabled prop blocks both selects", () => {
    setup({ disabled: true });
    expect(screen.getByLabelText("Start month")).toBeDisabled();
    expect(screen.getByLabelText("Start year")).toBeDisabled();
  });
});

describe("BulletsField", () => {
  const setup = (bullets: string[], errors?: unknown) =>
    render(
      <Harness defaults={{ bullets }} errors={errors}>
        {(f) => <BulletsField form={f} name="bullets" label="Bullets" max={10} maxLength={300} />}
      </Harness>,
    );
  it("error at bullets.2 shows under the third line only", () => {
    setup(["a", "b", "c"], { bullets: [undefined, undefined, { message: "Too long" }] });
    expect(screen.getAllByText("Too long")).toHaveLength(1);
    expect(screen.getByLabelText("Bullets 3")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Bullets 1")).not.toHaveAttribute("aria-invalid");
  });
  it("move up swaps lines", async () => {
    setup(["a", "b"]);
    await userEvent.click(screen.getByRole("button", { name: "Move Bullets 2 up" }));
    expect(val().bullets).toEqual(["b", "a"]);
  });
  it("add disabled at 10", () => {
    setup(Array.from({ length: 10 }, (_, i) => `x${i}`));
    expect(screen.getByRole("button", { name: "Add bullet" })).toBeDisabled();
  });
  it("add and remove", async () => {
    setup(["a"]);
    await userEvent.click(screen.getByRole("button", { name: "Add bullet" }));
    expect(val().bullets).toEqual(["a", ""]);
    await userEvent.click(screen.getByRole("button", { name: "Remove Bullets 1" }));
    expect(val().bullets).toEqual([""]);
  });
});

const png = (name = "a.png", size = 10, type = "image/png") => {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
};

describe("ImageDropZone keyboard", () => {
  const zone = () => screen.getByRole("button", { name: /cover.*(drop|choose)/i });
  const setup = () => {
    render(<Harness defaults={{ img: null, alt: null }}>{(f) => <ImageDropZone form={f} keyName="img" altName="alt" label="Cover" />}</Harness>);
    return vi.spyOn(screen.getByTestId("image-input") as HTMLInputElement, "click");
  };
  it("click on zone opens picker", async () => {
    const spy = setup();
    await userEvent.click(zone());
    expect(spy).toHaveBeenCalledTimes(1);
  });
  it("Enter opens picker", async () => {
    const spy = setup();
    zone().focus();
    await userEvent.keyboard("{Enter}");
    expect(spy).toHaveBeenCalledTimes(1);
  });
  it("Space opens picker", async () => {
    const spy = setup();
    zone().focus();
    await userEvent.keyboard(" ");
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("ImageDropZone", () => {
  const setup = (d: { img: string | null; alt: string | null } = { img: null, alt: null }) =>
    render(<Harness defaults={d}>{(f) => <ImageDropZone form={f} keyName="img" altName="alt" label="Cover" />}</Harness>);
  const input = () => screen.getByTestId("image-input") as HTMLInputElement;
  it("rejects a .gif before uploading (apiUpload not called)", async () => {
    setup();
    fireEvent.change(input(), { target: { files: [png("a.gif", 10, "image/gif")] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Use a JPEG, PNG or WebP image");
    expect(uploadState.calls).toHaveLength(0);
  });
  it('rejects a 5 MB PNG with "Image must be 4 MB or smaller"', async () => {
    setup();
    fireEvent.change(input(), { target: { files: [png("a.png", 5 * 1024 * 1024)] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Image must be 4 MB or smaller");
    expect(uploadState.calls).toHaveLength(0);
  });
  it("successful upload sets key and shows preview and the alt field", async () => {
    upload.mockResolvedValue({ key: "k1.png", url: "/api/files/k1.png", contentType: "image/png", size: 1 });
    setup();
    fireEvent.change(input(), { target: { files: [png()] } });
    await waitFor(() => expect(val().img).toBe("k1.png"));
    expect(uploadState.calls[0]).toEqual(["image", expect.any(File)]);
    expect(screen.getByTestId("image-preview")).toHaveAttribute("src", "/api/files/k1.png");
    expect(screen.getByLabelText("Cover alt text (required)")).toBeInTheDocument();
  });
  it("server 415 shows its message under the zone and keeps the old key", async () => {
    upload.mockImplementation(async () => { throw new ApiRequestError("That file type is not allowed", 415, "unsupported_type"); });
    setup({ img: "old.png", alt: "old" });
    fireEvent.change(input(), { target: { files: [png()] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("That file type is not allowed");
    expect(val().img).toBe("old.png");
  });
  it("Remove image clears key and alt", async () => {
    setup({ img: "old.png", alt: "old" });
    await userEvent.click(screen.getByRole("button", { name: "Remove image" }));
    expect(val()).toEqual({ img: null, alt: null });
  });
});

describe("FileField", () => {
  const setup = () =>
    render(<Harness defaults={{ cv: null }}>{(f) => <FileField form={f} name="cv" label="CV" accept="pdf" />}</Harness>);
  it("rejects a non-PDF", async () => {
    setup();
    fireEvent.change(screen.getByTestId("file-input"), {
      target: { files: [new File(["x"], "a.docx", { type: "application/msword" })] },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("Use a PDF file");
    expect(uploadState.calls).toHaveLength(0);
  });
  it("successful CV upload sets key", async () => {
    upload.mockResolvedValue({ key: "cv1.pdf", url: "/api/files/cv1.pdf", contentType: "application/pdf", size: 1 });
    setup();
    fireEvent.change(screen.getByTestId("file-input"), {
      target: { files: [new File(["x"], "me.pdf", { type: "application/pdf" })] },
    });
    await waitFor(() => expect(val().cv).toBe("cv1.pdf"));
    expect(uploadState.calls[0]).toEqual(["cv", expect.any(File)]);
    expect(screen.getByRole("link", { name: "me.pdf" })).toHaveAttribute("href", "/api/files/cv1.pdf");
  });
});

describe("Markdown", () => {
  it("<script> renders no script element", () => {
    const { container } = render(<MarkdownPreview source={"hi <script>alert(1)</script>"} />);
    expect(container.querySelector("script")).toBeNull();
  });
  it("<img onerror> renders no img", () => {
    const { container } = render(<MarkdownPreview source={'<img src=x onerror="alert(1)">'} />);
    expect(container.querySelector("img")).toBeNull();
  });
  it("image with data: src is dropped", () => {
    const { container } = render(<MarkdownPreview source="![x](data:image/png;base64,AAAA)" />);
    expect(container.querySelector("img")).toBeNull();
  });
  it("https image is dropped (CSP allows only same-origin images)", () => {
    const { container } = render(<MarkdownPreview source="![x](https://example.com/a.png)" />);
    expect(container.querySelector("img")).toBeNull();
  });
  it("/api/files image is kept", () => {
    const { container } = render(<MarkdownPreview source="![x](/api/files/abc123.png)" />);
    expect(container.querySelector("img")).toHaveAttribute("src", "/api/files/abc123.png");
  });
  it("preview uses prose-invert on the dark card, not dark:prose-invert", () => {
    const { container } = render(<MarkdownPreview source="# Hi" />);
    expect(container.firstElementChild).toHaveClass("prose-invert");
    expect(container.firstElementChild?.className).not.toContain("dark:");
  });
  it("javascript: link renders no anchor with that href", () => {
    const { container } = render(<MarkdownPreview source="[x](javascript:alert(1))" />);
    expect(container.querySelector('a[href^="javascript"]')).toBeNull();
  });
  it("normal link has rel and target", () => {
    render(<MarkdownPreview source="[link](https://example.com)" />);
    const a = screen.getByRole("link", { name: "link" });
    expect(a).toHaveAttribute("rel", "noopener noreferrer nofollow");
    expect(a).toHaveAttribute("target", "_blank");
  });
  it('Preview tab shows rendered heading for "# Title"', async () => {
    render(<Harness defaults={{ body: "# Title" }}>{(f) => <MarkdownEditor form={f} name="body" label="Body" />}</Harness>);
    await userEvent.click(screen.getByRole("tab", { name: "Preview" }));
    expect(screen.getByRole("heading", { name: "Title" })).toBeInTheDocument();
  });
});
