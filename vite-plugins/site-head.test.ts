import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { PublicContent } from "../shared/index";
import { buildPersonJsonLd, siteHead } from "./site-head";

const root = path.resolve(import.meta.dirname, "..");
const fallbackPath = path.join(root, "src/content/fallback.json");
const fallback = JSON.parse(readFileSync(fallbackPath, "utf8")) as PublicContent;
const template = readFileSync(path.join(root, "index.html"), "utf8");

type Profile = PublicContent["profile"];
const profile = (over: Partial<Profile> = {}): Profile => ({ ...fallback.profile, ...over });

function run(plugin: ReturnType<typeof siteHead>, html: string): string {
  const hook = plugin.transformIndexHtml as { handler: (html: string) => string };
  return hook.handler(html);
}

function transform(origin?: string, html = template): string {
  return run(siteHead({ fallbackPath, siteOrigin: origin }), html);
}

describe("buildPersonJsonLd", () => {
  it("returns the Person basics", () => {
    const ld = buildPersonJsonLd(profile());
    expect(ld["@context"]).toBe("https://schema.org");
    expect(ld["@type"]).toBe("Person");
    expect(ld.name).toBe(fallback.profile.name);
    expect(ld.jobTitle).toBe(fallback.profile.headline);
    expect(ld.email).toBe(fallback.profile.email);
  });

  it("omits null linkedinUrl and location, and sameAs holds only non-null URLs", () => {
    const ld = buildPersonJsonLd(profile({ linkedinUrl: null, location: null }));
    expect(ld).not.toHaveProperty("location");
    expect(ld).not.toHaveProperty("address");
    expect(JSON.stringify(ld)).not.toContain("null");
    expect(ld.sameAs).toEqual([fallback.profile.githubUrl]);
    const both = buildPersonJsonLd(profile({ linkedinUrl: "https://www.linkedin.com/in/x" }));
    expect(both.sameAs).toEqual([fallback.profile.githubUrl, "https://www.linkedin.com/in/x"]);
  });

  it("sets url only with an origin", () => {
    expect(buildPersonJsonLd(profile(), "https://www.yznmoh.com").url).toBe("https://www.yznmoh.com");
    expect(buildPersonJsonLd(profile())).not.toHaveProperty("url");
  });
});

describe("siteHead transformIndexHtml", () => {
  it("injects exactly one parseable JSON-LD script and fills every placeholder", () => {
    const out = transform("https://www.yznmoh.com");
    const scripts = out.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) ?? [];
    expect(scripts).toHaveLength(1);
    const json = JSON.parse((scripts[0] ?? "").replace(/^<script[^>]*>/, "").replace(/<\/script>$/, ""));
    expect(json["@type"]).toBe("Person");
    expect(out).not.toMatch(/%SITE_[A-Z]+%/);
    expect(out).not.toContain("<!--site:jsonld-->");
  });

  it("adds og:image and canonical only with an origin", () => {
    const withOrigin = transform("https://www.yznmoh.com");
    expect(withOrigin).toMatch(/<meta property="og:image" content="https:\/\/www\.yznmoh\.com\/share\.jpg"/);
    expect(withOrigin).toMatch(/<link rel="canonical" href="https:\/\/www\.yznmoh\.com\/"/);
    const without = transform();
    expect(without).not.toContain("og:image");
    expect(without).not.toContain('rel="canonical"');
  });

  it("never leaves a raw < inside the JSON-LD text", () => {
    const evil = JSON.parse(JSON.stringify(fallback)) as PublicContent;
    evil.profile.name = "A</script><b>x";
    const tmp = path.join(root, "node_modules/.site-head-evil.json");
    writeFileSync(tmp, JSON.stringify(evil));
    const out = run(siteHead({ fallbackPath: tmp }), template);
    const body = out.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1] ?? "";
    expect(body).not.toContain("\u003c");
    expect(body).toContain(String.fromCharCode(92) + "u003c");
    expect(JSON.parse(body).name).toBe("A</script><b>x");
  });

  it("has the static hero with no CV button and no Replit mention", () => {
    const out = transform();
    expect(out).not.toContain("I build for the web.");
    expect(out).not.toContain("hero__note");
    expect(out).not.toMatch(/download cv/i);
    expect(out).not.toMatch(/replit/i);
  });

  it("javascript: cvUrl emits no CV button", () => {
    const tmp = path.join(process.env.TMPDIR ?? process.env.TEMP ?? ".", `js-cv-${Math.random().toString(36).slice(2)}.json`);
    writeFileSync(tmp, JSON.stringify({ ...fallback, profile: { ...fallback.profile, cvUrl: "javascript:alert(1)" } }));
    const out = run(siteHead({ fallbackPath: tmp }), template);
    expect(out).not.toMatch(/javascript:/i);
    expect(out).not.toMatch(/Download CV/i);
  });
});

describe("strict CSP (script-src 'self')", () => {
  const inlineExecutable = (html: string) =>
    [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(
      ([, attrs, body]) => !/\bsrc=/.test(attrs ?? "") && !/type="application\/ld\+json"/.test(attrs ?? "") && (body ?? "").trim() !== "",
    );

  it("emits no inline executable script (only the ld+json data block)", () => {
    expect(inlineExecutable(transform("https://example.com"))).toEqual([]);
    expect(template).not.toContain('/boot.js');
  });

  it("built dist/index.html has none either, when a build exists", () => {
    let built: string;
    try {
      built = readFileSync(path.join(root, "dist/index.html"), "utf8");
    } catch {
      return;
    }
    expect(inlineExecutable(built)).toEqual([]);
  });
});
