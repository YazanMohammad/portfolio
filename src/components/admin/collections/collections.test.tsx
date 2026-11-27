import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Education, Experience, Skill } from "@shared/index";
import { ApiRequestError } from "@/lib/api";
import { UnsavedProvider } from "@/lib/admin/unsaved";
import { renderWithProviders } from "@/test/render";
import { ListEditor } from "../list/ListEditor";
import type { CollectionConfig, Row } from "../list/types";
import { experienceConfig, experienceSubtitle, POSITION_MAX } from "./experience";
import { educationConfig, DEGREE_MAX, DESCRIPTION_MAX } from "./education";
import { skillsConfig, SKILL_NAME_MAX } from "./skills";
import { formatYearMonth, copyName } from "./format";
import { ExperienceInput, EducationInput, SkillInput } from "@shared/index";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiGet: vi.fn(), apiSend: vi.fn() };
});
import { apiGet, apiSend } from "@/lib/api";

const exp = (over: Partial<Experience> = {}): Experience => ({
  id: 1, position: "Dev", company: "Acme", location: null, startDate: "2022-03", endDate: "2023-05",
  current: false, bullets: ["a", "b", "c"], isVisible: true, sortOrder: 0, ...over,
});
const edu = (over: Partial<Education> = {}): Education => ({
  id: 1, degree: "BSc", school: "Uni", location: null, startDate: null, endDate: null,
  description: null, isVisible: true, sortOrder: 0, ...over,
});
const skill = (over: Partial<Skill> = {}): Skill => ({
  id: 1, name: "Python", category: "Languages", iconSlug: null, isVisible: true, sortOrder: 0, ...over,
});

let list: Row[];
function setup<T extends Row, I>(config: CollectionConfig<T, I>) {
  vi.mocked(apiGet).mockImplementation((async (url: string) =>
    url === "/api/admin/summary" ? { toFillIn: [] } : list) as never);
  return renderWithProviders(
    <UnsavedProvider>
      <ListEditor config={config} />
    </UnsavedProvider>,
    { path: `/admin/${config.collection}` },
  );
}

beforeEach(() => {
  vi.mocked(apiGet).mockReset();
  vi.mocked(apiSend).mockReset();
  vi.mocked(apiSend).mockResolvedValue(undefined as never);
});

describe("formatYearMonth", () => {
  it("formats and handles null", () => {
    expect(formatYearMonth("2024-09")).toBe("Sep 2024");
    expect(formatYearMonth(null)).toBe("");
  });
});

describe("experience subtitle", () => {
  it("joins company and dates", () => {
    expect(experienceSubtitle(exp())).toBe("Acme · Mar 2022 – May 2023");
    expect(experienceSubtitle(exp({ current: true, endDate: null }))).toBe("Acme · Mar 2022 – Present");
  });
  it("with null company and null dates is just blank", () => {
    const s = experienceSubtitle(exp({ company: null, startDate: null, endDate: null }));
    expect(s).toBeNull();
    expect(experienceSubtitle(exp({ company: null }))).toBe("Mar 2022 – May 2023");
    expect(experienceSubtitle(exp({ startDate: null, endDate: "2023-05" }))).toBe("Acme · May 2023");
    expect(experienceSubtitle(exp({ startDate: "2022-03", endDate: null }))).toBe("Acme · Mar 2022");
  });
});

describe("experience form", () => {
  it("turning on current clears endDate and disables the End selects; off re-enables", async () => {
    list = [exp()];
    setup(experienceConfig);
    await userEvent.click(await screen.findByText("Dev"));
    const month = (await screen.findByLabelText("End month")) as HTMLSelectElement;
    const year = screen.getByLabelText("End year") as HTMLSelectElement;
    expect(year.value).toBe("2023");
    const sw = screen.getByRole("switch", { name: "I work here now" });
    await userEvent.click(sw);
    expect(month).toBeDisabled();
    expect(year).toBeDisabled();
    expect(month.value).toBe("");
    expect(year.value).toBe("");
    await userEvent.click(sw);
    expect(month).toBeEnabled();
    expect(year).toBeEnabled();
    expect(year.value).toBe("");
  });

  it("end before start shows the schema's error under End", async () => {
    list = [exp()];
    setup(experienceConfig);
    await userEvent.click(await screen.findByText("Dev"));
    await userEvent.selectOptions(await screen.findByLabelText("End year"), "2020");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    const msg = await screen.findByText("End date must not precede start date.");
    for (const label of ["End month", "End year"]) {
      const el = screen.getByLabelText(label);
      expect(el).toHaveAttribute("aria-invalid", "true");
      const ids = (el.getAttribute("aria-describedby") ?? "").split(" ");
      expect(ids).toContain(msg.id);
    }
    expect(apiSend).not.toHaveBeenCalled();
  });

  it("server error at bullets.2 appears under the third bullet", async () => {
    list = [exp()];
    setup(experienceConfig);
    await userEvent.click(await screen.findByText("Dev"));
    const position = await screen.findByLabelText(/^Position/);
    await userEvent.type(position, "!");
    vi.mocked(apiSend).mockRejectedValueOnce(
      new ApiRequestError("bad", 400, "validation", { "bullets.2": "Too long." }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    const third = await screen.findByLabelText("Bullets 3");
    await waitFor(() => expect(third).toHaveAttribute("aria-invalid", "true"));
    const msg = screen.getByText("Too long.");
    expect(msg.id).toBeTruthy();
    expect((third.getAttribute("aria-describedby") ?? "").split(" ")).toContain(msg.id);
    expect(screen.getByLabelText("Bullets 1")).not.toHaveAttribute("aria-invalid", "true");
  });

  it("server error for current shows under the switch", async () => {
    list = [exp()];
    setup(experienceConfig);
    await userEvent.click(await screen.findByText("Dev"));
    await userEvent.type(await screen.findByLabelText(/^Position/), "!");
    vi.mocked(apiSend).mockRejectedValueOnce(
      new ApiRequestError("bad", 400, "validation", { current: "Cannot be current." }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    const sw = await screen.findByRole("switch", { name: "I work here now" });
    await waitFor(() => expect(sw).toHaveAttribute("aria-invalid", "true"));
    const msg = screen.getByText("Cannot be current.");
    expect((sw.getAttribute("aria-describedby") ?? "").split(" ")).toContain(msg.id);
  });
});

describe("skills form", () => {
  it("category datalist offers existing categories", async () => {
    list = [
      skill({ id: 1, category: "Tools" }),
      skill({ id: 2, name: "Go", category: "Languages", sortOrder: 1 }),
      skill({ id: 3, name: "Rust", category: "Languages", sortOrder: 2 }),
    ];
    setup(skillsConfig);
    await userEvent.click(await screen.findByText("Python"));
    const input = await screen.findByLabelText(/^Category/);
    const listId = input.getAttribute("list");
    expect(listId).toBeTruthy();
    const dl = document.getElementById(listId!)!;
    expect(dl.tagName).toBe("DATALIST");
    expect([...dl.querySelectorAll("option")].map((o) => o.getAttribute("value"))).toEqual(["Languages", "Tools"]);
    expect(within(document.body).getByLabelText("Find on svgl")).toBeInTheDocument();
  });
  it("row subtitle shows the category", () => {
    expect(skillsConfig.rowSubtitle(skill())).toBe("Languages");
  });
});

describe("duplicateInput", () => {
  it("is hidden and renamed for each type", () => {
    const e = experienceConfig.duplicateInput(exp(), [], 4);
    expect(e).toMatchObject({ position: "Dev (copy)", isVisible: false, sortOrder: 4 });
    const d = educationConfig.duplicateInput(edu(), [], 4);
    expect(d).toMatchObject({ degree: "BSc (copy)", isVisible: false, sortOrder: 4 });
    const s = skillsConfig.duplicateInput(skill(), [], 4);
    expect(s).toMatchObject({ name: "Python (copy)", isVisible: false, sortOrder: 4 });
    expect("id" in e || "id" in d || "id" in s).toBe(false);
  });
});

describe("knownFields", () => {
  it("lists every bullet path", () => {
    for (let i = 0; i < 10; i++) expect(experienceConfig.knownFields).toContain(`bullets.${i}`);
    expect(experienceConfig.knownFields).toContain("bullets");
  });
});

describe("duplicate within schema limits", () => {
  it("pins the schema maxima", () => {
    expect([POSITION_MAX, DEGREE_MAX, SKILL_NAME_MAX, DESCRIPTION_MAX]).toEqual([100, 100, 50, 1000]);
  });
  it("copyName truncates the base before the suffix", () => {
    expect(copyName("Dev", 100)).toBe("Dev (copy)");
    expect(copyName("a".repeat(20) + "  ", 20)).toHaveLength(20);
    expect(copyName("x".repeat(60), 50)).toBe("x".repeat(43) + " (copy)");
  });
  it("copyName never leaves a lone surrogate", () => {
    const t = copyName("t".repeat(92) + "\u{1F600}" + "t".repeat(6), 100);
    expect(t).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
    expect(t.length).toBeLessThanOrEqual(100);
    expect(copyName("e" + "\u0301".repeat(30), 10)).not.toMatch(/\u0301/);
  });
  it("copyName keeps a whole emoji that fits", () => {
    expect(copyName("ab\u{1F600}", 50)).toBe("ab\u{1F600} (copy)");
    expect(copyName("t".repeat(91) + "\u{1F600}", 100)).toBe("t".repeat(91) + "\u{1F600} (copy)");
  });
  it("duplicate of a max-length position stays within 100", () => {
    const d = experienceConfig.duplicateInput(exp({ position: "p".repeat(100) }), [], 1);
    expect(d.position.length).toBeLessThanOrEqual(100);
    expect(ExperienceInput.safeParse(d).success).toBe(true);
  });
  it("duplicate of a max-length degree stays within 100", () => {
    const d = educationConfig.duplicateInput(edu({ degree: "d".repeat(100) }), [], 1);
    expect(d.degree.length).toBeLessThanOrEqual(100);
    expect(EducationInput.safeParse(d).success).toBe(true);
  });
  it("duplicate of a max-length skill name stays within 50", () => {
    const d = skillsConfig.duplicateInput(skill({ name: "s".repeat(50) }), [], 1);
    expect(d.name.length).toBeLessThanOrEqual(50);
    expect(SkillInput.safeParse(d).success).toBe(true);
  });
});

describe("education form", () => {
  it("description textarea is capped by the schema", async () => {
    list = [edu()];
    setup(educationConfig);
    await userEvent.click(await screen.findByText("BSc"));
    expect(await screen.findByLabelText("Description")).toHaveAttribute("maxlength", "1000");
  });
});
