import { readFileSync } from "node:fs";
import type { Plugin } from "vite";
import type { PublicContent } from "../shared/index";
import { mergeSettings, derivePalette } from "../shared/settings";
import { siteCopy } from "../src/content/copy";
import { safeHref } from "../src/lib/site/safe-href";

type Profile = PublicContent["profile"];

export function buildPersonJsonLd(profile: Profile, origin?: string): Record<string, unknown> {
  const sameAs = [profile.githubUrl, profile.linkedinUrl].map((u) => safeHref(u)).filter((u): u is string => u !== null);
  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: profile.name,
    jobTitle: profile.headline,
    email: profile.email,
  };
  if (origin) ld.url = origin;
  if (profile.location) ld.homeLocation = { "@type": "Place", name: profile.location };
  if (sameAs.length > 0) ld.sameAs = sameAs;
  return ld;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function renderHeroExtras(profile: Profile, copy = siteCopy): { cv: string; meta: string } {
  const cvHref = safeHref(profile.cvUrl);
  const cv = cvHref
    ? `<a class="btn btn--secondary" href="${escapeHtml(cvHref)}">${escapeHtml(copy.hero.secondary)}</a>`
    : "";
  const mailHref = safeHref(`mailto:${profile.email}`, { allowMailto: true });
  const parts = [
    profile.availabilityText ? `<span class="hero__status">${escapeHtml(profile.availabilityText)}</span>` : "",
    mailHref ? `<a class="link" href="${escapeHtml(mailHref)}">${escapeHtml(copy.hero.emailLabel)}</a>` : "",
  ].join("");
  return { cv, meta: `<p class="hero__extras">${parts}</p>` };
}

export function siteHead(options: { fallbackPath: string; siteOrigin?: string }): Plugin {
  return {
    name: "site-head",
    transformIndexHtml: {
      order: "pre",
      handler(html: string) {
        const snapshot = JSON.parse(readFileSync(options.fallbackPath, "utf8")) as PublicContent;
        const { profile } = snapshot;
        const { copy, theme } = mergeSettings(snapshot.settings);
        const origin = options.siteOrigin?.replace(/\/+$/, "") || undefined;
        const jsonLd = JSON.stringify(buildPersonJsonLd(profile, origin)).replace(/</g, () => String.fromCharCode(92) + "u003c");
        const originTags = origin
          ? [
              `<link rel="canonical" href="${escapeHtml(origin)}/">`,
              `<meta property="og:image" content="${escapeHtml(origin)}/share.jpg">`,
            ].join("\n    ")
          : "";
        const extras = renderHeroExtras(profile, copy);
        return html
          .replace("<!--site:cv-->", () => extras.cv)
          .replace("<!--site:meta-->", () => extras.meta)
          .replace("<!--site:location-->", () => profile.location ? `<p class="eyebrow">${escapeHtml(profile.location)}</p>` : "")
          .replace("<!--site:jsonld-->", () => `<script type="application/ld+json">${jsonLd}</script>`)
          .replace("<!--site:origin-->", () => originTags)
          .replace(/%SITE_TITLE%/g, () => escapeHtml(copy.meta.title))
          .replace(/%SITE_DESCRIPTION%/g, () => escapeHtml(copy.meta.description))
          .replace(/%SITE_BG%/g, () => derivePalette(theme.hue).bg)
          .replace(/%SITE_PRIMARY%/g, () => escapeHtml(copy.hero.primary))
          .replace(/%SITE_NAME%/g, () => escapeHtml(profile.name))
          .replace(/%SITE_HEADLINE%/g, () => escapeHtml(profile.headline))
          .replace(/%SITE_INTRO%/g, () => escapeHtml(profile.intro))
          .replace(/%SITE_SKIP%/g, () => escapeHtml(copy.skipLink));
      },
    },
  };
}
