import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PublicContent } from "@shared/index";
import fallback from "@/content/fallback.json";
import { PhotoSlot } from "./PhotoSlot";

const base = (fallback as unknown as PublicContent).profile;

describe("PhotoSlot", () => {
  it("renders the monogram tile without a photo", () => {
    const { container } = render(<PhotoSlot profile={{ ...base, photoUrl: null, photoAlt: null }} size="hero" />);
    const tile = screen.getByRole("img", { name: "Yazan Mohammad" });
    expect(tile).toHaveTextContent("YM");
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("figcaption")).toBeNull();
  });

  it("renders the real photo with its alt and no monogram", () => {
    const { container } = render(
      <PhotoSlot profile={{ ...base, photoUrl: "/api/files/x", photoAlt: "Yazan at a desk" }} size="about" />,
    );
    const imgs = container.querySelectorAll("img");
    expect(imgs).toHaveLength(1);
    expect(imgs[0]).toHaveAttribute("src", "/api/files/x");
    expect(imgs[0]).toHaveAttribute("alt", "Yazan at a desk");
    expect(screen.queryByText("YM")).toBeNull();
  });

  it("gives the monogram and the photo the same ratio wrapper, with no grid on it", () => {
    const mono = render(<PhotoSlot profile={{ ...base, photoUrl: null, photoAlt: null }} size="hero" />).container;
    const photo = render(<PhotoSlot profile={{ ...base, photoUrl: "/api/files/x", photoAlt: "a" }} size="hero" />).container;
    const m = mono.firstElementChild as HTMLElement;
    const p = photo.firstElementChild as HTMLElement;
    expect(m.className).toBe(p.className);
    expect(m.className).toContain("frame--portrait");
    expect(m.className).toContain("frame--photo");
    expect(m.getAttribute("style")).toBe(p.getAttribute("style"));
    const css = readFileSync(path.resolve(import.meta.dirname, "site.css"), "utf8");
    const rule = css.split("\n").filter((l) => /^\.photo-slot\.frame--photo/.test(l)).join("\n");
    expect(rule).not.toMatch(/display:\s*grid/);
  });

  // Browser check owed: at 390px and 1440px the monogram and photo boxes must measure identically.
});

describe("site.css colours", () => {
  it("has no literal colours", () => {
    const css = readFileSync(path.resolve(import.meta.dirname, "site.css"), "utf8");
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(|(?<![\w-])(black|white)(?![\w-])/i);
  });
});
