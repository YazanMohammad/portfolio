import { readFileSync } from "node:fs";
import path from "node:path";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PublicContent } from "@shared/index";
import fallback from "@/content/fallback.json";
import { siteHead } from "../../../vite-plugins/site-head";
import { Hero } from "./Hero";

const root = path.resolve(import.meta.dirname, "../../..");
const fallbackPath = path.join(root, "src/content/fallback.json");

function shell(profileOver: object | null): string {
  const tpl = readFileSync(path.join(root, "index.html"), "utf8");
  let fp = fallbackPath;
  if (profileOver) {
    const c = JSON.parse(readFileSync(fallbackPath, "utf8"));
    c.profile = { ...c.profile, ...profileOver };
    fp = path.join(process.env.TMPDIR ?? process.env.TEMP ?? ".", `parity-${Math.random().toString(36).slice(2)}.json`);
    require_write(fp, JSON.stringify(c));
  }
  const hook = siteHead({ fallbackPath: fp }).transformIndexHtml as { handler: (h: string) => string };
  return hook.handler(tpl);
}
import { writeFileSync } from "node:fs";
const require_write = (p: string, s: string) => writeFileSync(p, s);

const content = fallback as unknown as PublicContent;

describe("Hero / static shell parity", () => {
  for (const [name, over] of [
    ["fallback profile", null],
    ["with cv, status and no location", { cvUrl: "/cv", availabilityText: "Open to work", location: null }],
    ["with a javascript: cv", { cvUrl: "javascript:alert(1)" as unknown as "/cv" }],
  ] as const) {
    it(`name, intro and safe CV match the shell for: ${name}`, () => {
      const profile = { ...content.profile, ...(over ?? {}) };
      const doc = new DOMParser().parseFromString(shell(over), "text/html");
      const { container } = render(<Hero profile={profile} projects={content.projects} />);
      expect(container.querySelector("h1")?.textContent).toBe(doc.querySelector("h1")?.textContent);
      expect(container.querySelector(".hero__lead")?.textContent).toBe(doc.querySelector(".hero__lead")?.textContent);
      expect(container.querySelector('a[href="/cv"]')?.getAttribute("href")).toBe(doc.querySelector('a[href="/cv"]')?.getAttribute("href"));
    });
  }
});
