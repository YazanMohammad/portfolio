import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PublicContent } from "@shared/index";
import fallback from "@/content/fallback.json";
import { AboutSection } from "./AboutSection";
const profile = (fallback as unknown as PublicContent).profile;
describe("AboutSection", () => {
  it("renders nothing for empty about", () => {
    const { container } = render(<AboutSection profile={{ ...profile, about: " \n " }} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("renders paragraphs without inventing a portrait", () => {
    const { container } = render(<AboutSection profile={{ ...profile, about: "a\n\nb", photoUrl: null }} />);
    expect([...container.querySelectorAll(".about-copy p")].map(p => p.textContent)).toEqual(["a", "b"]);
    expect(screen.queryByRole("img")).toBeNull();
    expect(container.querySelector("figcaption")).toBeNull();
  });
});
