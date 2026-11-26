import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PublicContent } from "@shared/index";
import { TimelineSection } from "./TimelineSection";

type Exp = PublicContent["experience"][number];
type Edu = PublicContent["education"][number];
const exp = (o: Partial<Exp> = {}): Exp => ({ id: 1, position: "AI Engineer", company: null, location: null, startDate: null, endDate: null, current: true, bullets: [], sortOrder: 1, ...o });
const edu = (o: Partial<Edu> = {}): Edu => ({ id: 1, degree: "B.S. Computer Science", school: "Zarqa University", location: null, startDate: null, endDate: null, description: null, sortOrder: 1, ...o });

describe("TimelineSection", () => {
  it("shows a role with unknown company and dates as just the position", () => {
    const { container } = render(<TimelineSection experience={[exp()]} education={[]} />);
    const row = container.querySelector(".rows > li")!;
    expect(row.textContent).toBe("AI Engineer");
    expect(row.querySelector(".rows__value")).toBeNull();
    expect(row.querySelector(".timeline__meta")).toBeNull();
    expect(within(row as HTMLElement).queryByRole("list")).toBeNull();
  });
  it("shows company, range and bullets", () => {
    render(<TimelineSection experience={[exp({ position: "Intern", company: "Xocialive", startDate: "2024-09", endDate: "2025-01", current: false, bullets: ["One", "Two"] })]} education={[]} />);
    expect(screen.getByText("Xocialive")).toBeInTheDocument();
    expect(screen.getByText("Sep 2024 – Jan 2025")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").map((l) => l.textContent)).toEqual(expect.arrayContaining(["One", "Two"]));
  });
  it("keeps API order", () => {
    const { container } = render(<TimelineSection experience={[
      exp({ id: 1, position: "First", current: false, startDate: "2022-01", endDate: "2023-01", sortOrder: 20 }),
      exp({ id: 2, position: "Second", current: true, startDate: "2026-01", sortOrder: 0 }),
      exp({ id: 3, position: "Third", current: false, startDate: "2020-01", endDate: "2021-01", sortOrder: 10 }),
    ]} education={[
      edu({ id: 1, degree: "First degree", startDate: "2022-01", endDate: "2023-01", sortOrder: 20 }),
      edu({ id: 2, degree: "Second degree", startDate: "2026-01", endDate: "2026-06", sortOrder: 0 }),
      edu({ id: 3, degree: "Third degree", startDate: "2020-01", endDate: "2021-01", sortOrder: 10 }),
    ]} />);
    const lists = container.querySelectorAll(".rows");
    expect([...lists[0].querySelectorAll("h4")].map((e) => e.textContent)).toEqual(["First", "Second", "Third"]);
    expect([...lists[1].querySelectorAll("h4")].map((e) => e.textContent)).toEqual(["First degree", "Second degree", "Third degree"]);
  });
  it("education without description and location shows degree and school only", () => {
    const { container } = render(<TimelineSection experience={[]} education={[edu()]} />);
    const row = container.querySelector(".rows > li")!;
    expect(row.textContent).toBe("B.S. Computer ScienceZarqa University");
    expect(row.querySelector(".rows__value")).toBeNull();
    expect(row.querySelectorAll(".timeline__meta")).toHaveLength(1);
    expect(row.querySelector(".timeline__meta")?.textContent).toBe("Zarqa University");
    expect(row.querySelector("ul")).toBeNull();
  });
  it("renders nothing when empty; heading and group with only education", () => {
    const empty = render(<TimelineSection experience={[]} education={[]} />);
    expect(empty.container).toBeEmptyDOMElement();
    empty.unmount();
    const { container } = render(<TimelineSection experience={[]} education={[edu()]} />);
    expect(screen.getByRole("heading", { level: 2, name: "Experience and education" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Education" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Experience" })).toBeNull();
    expect(container.querySelector("section#experience")).not.toBeNull();
  });
});
