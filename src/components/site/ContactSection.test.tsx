import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PublicContent } from "@shared/index";
import fallback from "@/content/fallback.json";
import { Footer } from "./Footer";
import { ContactSection } from "./ContactSection";
const profile = (fallback as unknown as PublicContent).profile;
describe("ContactSection footer slot composition", () => {
  it("puts contact and its safe mail link only in the existing closing footer", () => {
    const { container } = render(<Footer profile={profile} contactForm={<ContactSection profile={profile} />} />);
    const footer = container.querySelector("footer#contact")!;
    expect(container.querySelectorAll("#contact")).toHaveLength(1);
    expect(footer.querySelector(".contact-grid form")).not.toBeNull();
    expect(screen.getByRole("link", { name: profile.email })).toHaveAttribute("href", `mailto:${profile.email}`);
    expect(footer.querySelectorAll("h2")).toHaveLength(1);
  });
  it("omits an unsafe mail link without removing the form", () => {
    const unsafe = { ...profile, email: "bad\naddress" };
    render(<Footer profile={unsafe} contactForm={<ContactSection profile={unsafe} />} />);
    expect(screen.queryByRole("link", { name: /bad.*address/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Send message" }).closest("footer#contact")).not.toBeNull();
  });
});
