import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { act } from "react";
import { useSearch } from "wouter";
import { renderWithProviders } from "./render";

function Search() {
  return <p data-testid="s">{useSearch()}</p>;
}

describe("renderWithProviders", () => {
  it("useSearch sees the query string", () => {
    renderWithProviders(<Search />, { path: "/admin?expired=1" });
    expect(screen.getByTestId("s")).toHaveTextContent("expired=1");
  });

  it("navigate updates location and search", () => {
    const { navigate, location } = renderWithProviders(<Search />, { path: "/a" });
    expect(screen.getByTestId("s")).toHaveTextContent("");
    act(() => navigate("/b?x=2"));
    expect(location()).toBe("/b?x=2");
    expect(screen.getByTestId("s")).toHaveTextContent("x=2");
  });
});
