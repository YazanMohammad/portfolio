import { screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { renderWithClient } from "@/test/utils";
import { siteCopy } from "@/content/copy";
import NotFound from "./NotFound";
vi.mock("@/lib/api", async (original) => ({ ...await original<typeof import("@/lib/api")>(), apiGet: vi.fn(() => new Promise(() => {})) }));
it("renders page 404 with one h1, React metadata, home action and only existing section anchors", () => {
  const { container } = renderWithClient(<NotFound />, { path: "/missing" });
  expect(screen.getByRole("heading", { level: 1, name: siteCopy.notFound.heading })).toBeInTheDocument();
  expect(screen.getByText(siteCopy.notFound.line)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: siteCopy.notFound.action })).toHaveAttribute("href", "/");
  expect(document.title).toBe("Page not found | Yazan Mohammad");
  expect(container.querySelectorAll("h1")).toHaveLength(1);
  expect(container.querySelector('a[href="#about"], a[href="#work"], a[href="#skills"], a[href="#experience"]')).toBeNull();
});

it("has a plain one-screen footer with no moment", () => {
  const { container } = renderWithClient(<NotFound />, { path: "/missing" });
  expect(container.querySelector("[data-moment]")).toBeNull();
  expect(container.querySelector(".mo-la__type, .mo-la__sub")).toBeNull();
  expect(container.querySelector("footer#contact")?.getAttribute("style") ?? "").not.toContain("--h");
});
