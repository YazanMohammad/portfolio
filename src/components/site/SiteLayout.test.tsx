import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicContent } from "@shared/index";
import fallback from "@/content/fallback.json";
import { renderWithClient } from "@/test/utils";
import { siteCopy } from "@/content/copy";


import { SiteLayout } from "./SiteLayout";

const content = fallback as unknown as PublicContent;

describe("SiteLayout", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders skip link, nav, focusable main and contact footer", () => {
    const { unmount } = renderWithClient(
      <SiteLayout content={content}><p>child</p></SiteLayout>,
    );
    expect(screen.getByRole("link", { name: siteCopy.skipLink })).toHaveAttribute("href", "#top");
    expect(document.querySelector("main#top")).toHaveTextContent("child");
    expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
    expect(document.querySelector("footer#contact")).not.toBeNull();
    expect(document.querySelector("main#top")).toHaveAttribute("tabindex","-1");
    unmount();
  });

  it("lists only the nav sections that have content", () => {
    renderWithClient(
      <SiteLayout content={{ ...content, skills: [], experience: [], education: [] }}><p /></SiteLayout>,
    );
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(nav).not.toHaveTextContent(siteCopy.nav.skills);
    expect(nav).not.toHaveTextContent(siteCopy.nav.experience);
    expect(nav).toHaveTextContent(siteCopy.nav.work);
  });

  it("renders the contact form slot in the close", () => {
    renderWithClient(
      <SiteLayout content={content} contactForm={<form aria-label="slot" />}><p /></SiteLayout>,
    );
    expect(screen.getByRole("form", { name: "slot" })).toBeInTheDocument();
  });

});
