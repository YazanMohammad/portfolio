import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageHeader } from "./PageHeader";

describe("PageHeader", () => {
  it("renders title, intro and optional kicker", () => {
    render(<PageHeader kicker="Content" title="Projects" intro="One line." />);
    expect(screen.getByRole("heading", { level: 1, name: "Projects" })).toBeInTheDocument();
    expect(screen.getByText("One line.")).toBeInTheDocument();
    expect(screen.getByText("Content")).toBeInTheDocument();
  });
  it("omits the kicker and actions when not given", () => {
    const { container } = render(<PageHeader title="Look" />);
    expect(container.querySelector(".admin-kicker")).toBeNull();
    expect(container.querySelector(".admin-page-header__actions")).toBeNull();
  });
});
