# Public Site Implementation Plan

> **Integration:** contract section 9 (`docs/superpowers/plans/2026-11-25-contract.md`) overrides this plan where they differ.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the public page of the app (flat single package, contract section 1) with a new software-kind site built by the `design-taste-frontend` skill, filled from `GET /api/content`, with a project page, a working contact form and a 404 page.

**Architecture:** One Vite/React app. The taste kit is copied to `public/assets` and loaded as plain files; React components emit the kit's markup and classes. `index.html` holds a static first-screen shell (name, headline, meta, JSON-LD built from seed content at build time). `useSiteContent()` shows a committed snapshot (`src/content/fallback.json`) until `/api/content` answers, and keeps it if the call fails. Palette, fonts, hero and moments are dealt by the skill's scripts during execution, never chosen here.

**Tech Stack:** Vite, React 19, TypeScript, wouter, TanStack Query, `react-markdown` (new), Vitest + Testing Library + jsdom (new), the taste kit (`system.css`, `system.js`, `motion`, `layout`, `moments`).

**Spec:** `docs/superpowers/specs/2026-11-25-portfolio-v2-redesign-design.md` (section 11 is this plan; sections 4, 5, 13, 16 also bind). Shared names: `docs/superpowers/plans/2026-11-25-contract.md` (binding).

`<skill>` below means `C:/Users/Yzn/AppData/Local/hermes/skills/taste-skill`. All skill commands run from the repo root. Read `<skill>/SKILL.md` first, then `references/copy.md`, `copy-voice.md`, `system.md`, `layout-v4.md`, `sections.md` in full before Task 2.

## Global Constraints

- Page kind: **software** (`<html data-type="software">`, `site-kind` software). Spec section 11.
- Sections in this order: hero, selected work, experience and education, skills, about, contact. No others.
- Never pick the palette, fonts, hero layout, moments or nav/footer/close parts by taste. The skill's scripts deal them (`deal.mjs`, `start.mjs`, `moments.mjs`, the one-liner); results are recorded in `.taste-skill/deal.md` and the comment at the top of `<body>`.
- Never edit files in `public/assets` that came from the kit. Never hide anything from the checker; a false FAIL goes in `.taste-skill/waivers.json` with a reason.
- Never violet, gradient text, glows, fake code windows, skill percentages or levels, typing headlines, inflated stats (spec section 4).
- Copy: plain, specific, short, nothing invented. Current role is "AI Engineer"; company and start date are unknown and must not be written anywhere. Unknown facts are `null` and hidden.
- Content names come from the contract: `PublicContent`, `PublicProject`, query keys `["content"]` and `["project", slug]`, `apiGet`, `apiSend`, `ApiRequestError`, `fileUrl`, `MessageInput`. Do not rename or reshape them.
- `pnpm-workspace.yaml` `minimumReleaseAge: 1440` stays. New packages are mature versions only: `react-markdown@^10`, `vitest@^3`, `@testing-library/react@^16`, `@testing-library/user-event@^14`, `@testing-library/jest-dom@^6`, `jsdom@^26`. If pnpm refuses a version, take the next older one; never add an exclusion.
- English only. Copy lives in `src/content/copy.ts` (one place, so a translation can be added later).
- Public pages never import `src/components/admin/*` or `src/components/ui/*`.
- Use the kit's classes and tokens. Page CSS only where a skill reference says page CSS.

## Review Focus

Spec-implied failures no obvious test covers; each gets a test in the named task.

1. Empty collections (no projects, no skills, no experience): the section and its nav word disappear, no empty heading. Task 7, 8.
2. A project with no image, no live link and no GitHub link: card still reads finished (live HTML stand-in), no dead `<a>`. Task 7.
3. API pending or failing: first screen never blank; the slow case shows the snapshot at once, then swaps without remounting the hero. Task 5.
4. Contact: double submit sends once; a network failure (not an `ApiRequestError`) shows a retry message and keeps what was typed. Task 9.
5. Project write-up with raw HTML, `javascript:` links and a very long code line: nothing runs, nothing overflows at 390. Task 10.

## Routes handed to the admin plan (it owns `App.tsx`)

`/` → `pages/site/Home`, `/projects/:slug` → `pages/site/Project`, fallthrough → `pages/site/NotFound`. All three default-export a component. Handoff is checked in Task 13.

## File Structure

```
(repo root)
  index.html                         static shell, kit links, JSON-LD slot
  vite.config.ts                     Replit/PORT/BASE_PATH removed (Task 1); site-head plugin added (Task 4)
  vite-plugins/site-head.ts          build-time JSON-LD + meta from fallback.json and SITE_ORIGIN
  src/test/setup.ts                  (the root vitest.config.ts is owned by backend Task 1)
  public/assets/                     kit copy (never edited)
  public/share.jpg                   hero tile from shoot.mjs
  src/index.css                      Tailwind import + dealt token block (admin reuses)
  src/content/copy.ts                all words: profile intro/about, headings, buttons, form text
  src/content/fallback.json          committed PublicContent snapshot
  src/content/icons.json             slugs that have a file in public/assets/icons
  src/lib/site/use-content.ts        useSiteContent, useProject
  src/lib/site/format.ts             formatRange, hostLabel, paragraphs
  src/lib/site/kit.ts                loads/refreshes the kit's scripts, toggles kit CSS
  src/pages/site/{Home,Project,NotFound}.tsx
  src/components/site/               SiteLayout, Nav, Hero, PhotoSlot, WorkSection, ProjectFrame,
                                     ProjectCard, ProjectRow, TimelineSection, SkillsSection,
                                     AboutSection, ContactSection, ContactForm, Footer, Markdown
  .taste-skill/                      plan.md, deal.md, history json, waivers.json, report.md
```

---

### Task 1: Setup (deps, test setup, vite cleanup, kit)

Model: HAIKU

**Files:**
- Modify: `package.json`, `vite.config.ts`, `tsconfig.json` (only if `vitest/globals` is missing from `types`)
- Create: `src/test/setup.ts`, `public/assets/**` (copy of `<skill>/assets`), `.taste-skill/.gitkeep`

**Interfaces:**
- Consumes: root `vitest.config.ts` with the `node` and `dom` projects (backend Task 1 creates it; if it is missing, stop and wait; do not write it). Task 0 already added the `.gitignore` entries for `.taste-skill/chrome-*` and `shots/`.
- Produces: `pnpm dev:web` serves on `http://localhost:5173/` with no env vars set.

- [ ] **Step 1:** Add the devDependencies listed in Global Constraints that are not already in `package.json` (backend may have added `vitest`); do not add a `vitest.config.ts`. Run `pnpm install`. Expected: installs, lockfile changes.
- [ ] **Step 2:** In `vite.config.ts` remove the `PORT` and `BASE_PATH` checks (default port 5173, `base: "/"`) and any Replit plugins and imports left (contract section 9.6). Keep `react()`, `tailwindcss()`, the `@` and `@shared` aliases, `outDir: dist`.
- [ ] **Step 3:** Create `src/test/setup.ts`: it imports `@testing-library/jest-dom/vitest` and runs `cleanup` after each test. Check that the root `vitest.config.ts` runs the `dom` project with `setupFiles: src/test/setup.ts` and that the two projects together pick up `src/**/*.test.ts`, `src/**/*.test.tsx` and `vite-plugins/**/*.test.ts` (this plan has tests of all three kinds). If the config misses a pattern, do not edit it: report the gap to the owner. Add `"vitest/globals"` to `types` in `tsconfig.json` if absent.
- [ ] **Step 4:** Copy the kit: `cp -r <skill>/assets public/assets`. Keep the rest of `.taste-skill` committed.
- [ ] **Step 5:** Verify. Run: `pnpm dev:web` for 5 seconds, then `curl -sI http://localhost:5173/assets/system.css`. Expected: `200`. Run: `pnpm test`. Expected: exit 0 (no config error; other plans' tests may run).
- [ ] **Step 6:** Commit `chore(site): test setup, vite cleanup, taste kit in public/assets`.

---

### Task 2: Brief, fact sheet, copy, gate armed

Model: SONNET

**Files:**
- Create: `.taste-skill/plan.md`, `.taste-skill/copy-draft.md`, `src/content/copy.ts`, `src/content/copy.test.ts`

**Interfaces:**
- Produces (`src/content/copy.ts`, pure TS, no imports, so the backend seed can import it by relative path):
  ```ts
  export const PROFILE_INTRO: string;   // 1..200 chars, hero line
  export const PROFILE_ABOUT: string;   // 0..3000 chars, blank-line paragraphs
  export const siteCopy: {
    nav: { work: string; experience: string; skills: string; about: string; contact: string };
    hero: { primary: string; secondary: string; emailLabel: string };
    work: { heading: string; moreHeading: string; viewProject: string; viewCode: string; viewLive: string };
    timeline: { heading: string; experience: string; education: string; now: string };
    skills: { heading: string };
    about: { heading: string };
    contact: { heading: string; lead: string; labels: { name: string; email: string; subject: string; message: string };
               submit: string; sending: string; sent: string; networkError: string; rateLimited: string; emailPrefix: string };
    project: { back: string; stack: string; role: string; links: string; notFound: { heading: string; line: string; action: string }; loadError: string };
    notFound: { heading: string; line: string; action: string };
    footer: { rights: string };
  };
  ```
- Consumes: nothing.

- [ ] **Step 1: Brief.** In `.taste-skill/plan.md` write line 1 `Kind: software`, what is sold (one person's engineering work and availability), buyers (recruiter, client, engineer), main action, and the real material: the facts of spec section 5 only (no photo, no company, no dates for the AI Engineer role, three projects, the intern role, degree, email, GitHub, CV link only when uploaded).
- [ ] **Step 2: Arm the gate** (skill step 1), with the dev server running:
  `node <skill>/scripts/gate.mjs --start http://localhost:5173/ --kind software --category "software and AI engineer portfolio" --primary "<main action>"`
  Main action: the filled button, same words in nav, hero and close. Start from spec words "See my work" (filled) and "Download CV" (secondary, shown only when a CV exists). If `copy-lint` or the checker rejects this pair, change the wording and say why in the report.
- [ ] **Step 3: Fact sheet and voice card** per `copy-voice.md` sections 1 to 3, written into `plan.md`. One register from `copy-registers.md`, chosen by buyer and character. No invented numbers, clients, quotes or "years of experience".
- [ ] **Step 4: Write all copy** into `.taste-skill/copy-draft.md` first (headings are nouns, buttons verb plus object, h1 names the category and the buyer, one hard fact on the first screen, 60 to 80 words a screen). Hero line (`PROFILE_INTRO`) one plain sentence on what he builds. `PROFILE_ABOUT` 2 to 3 short paragraphs from known facts only. Run `node <skill>/scripts/copy-lint.mjs .taste-skill/copy-draft.md --kind software`. Expected: no FAIL.
- [ ] **Step 5: Failing test** `src/content/copy.test.ts`:
  - `PROFILE_INTRO.length` is between 1 and 200.
  - `PROFILE_ABOUT.length` is at most 3000 and contains no `\n\n\n`.
  - Neither string matches `/(passionate|seamless|leverag|cutting-edge|\d+\+ )/i`.
  - Neither string contains "Xocialive" with a date other than "Sep 2024" or "Jan 2025" (no invented dates), and neither contains a company name for the AI Engineer role.
  - `siteCopy.hero.primary` and `.secondary` start with a verb from the skill's button list (`See`, `Download`, `Send`, `Email`, `Contact`, `Read`, `Get`).
  Run: `pnpm test src/content/copy.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 6:** Write `copy.ts` to the interface above from the draft. Run the test. Expected: PASS.
- [ ] **Step 7:** Tell the backend plan owner (final report) that the seed imports `PROFILE_INTRO` and `PROFILE_ABOUT` from `src/content/copy.ts`.
- [ ] **Step 8:** Commit `feat(site): brief, plan and copy`.

---

### Task 3: Deal and tokens

Model: SONNET

**Files:**
- Modify: `.taste-skill/plan.md` (lines 2 and the section list), `src/index.css`
- Create: `.taste-skill/deal.md`, `.taste-skill/history.json`, `.taste-skill/layout-history.json` (by the scripts)

**Interfaces:**
- Produces: in `src/index.css` a block fenced by `/* SITE TOKENS START */` and `/* SITE TOKENS END */` holding the `:root` block exactly as `start.mjs css` prints it (the kit's token names, such as `--p-bg`, `--p-ink`, `--action`, `--g-main`, `--r-*`, the `--t-*` scale). The admin plan maps its own colours, type and spacing to these names.
- Produces: the font links the pairing needs, listed in `deal.md` for Task 4.

- [ ] **Step 1: Hero.** `node <skill>/assets/layout/deal.mjs --type software --has ui --history .taste-skill/layout-history.json`. Take the printed hero. (`--has ui` because the page shows live HTML, not photographs.)
- [ ] **Step 2: Palette and type.** `node <skill>/scripts/start.mjs deal --page software --trade "software and AI engineering" --history .taste-skill/history.json`; take the first palette and pairing (add `--axis` after a word or editorial hero). Then `node <skill>/scripts/start.mjs css --page software --palette <id> --type <id> --radius sharp --history .taste-skill/history.json`. Radius `sharp`: a developer's page. Never violet; deal again if printed.
- [ ] **Step 3: Parts and moments.** Run the one-liner with the software lists from `SKILL.md` section 4 (nav, footer, close, rhythm, buttons, mark). Run `node <skill>/scripts/moments.mjs pick --page software --count 1 --fits section,statement --history .taste-skill/history.json`. The page is short (six sections): one moment. Take the first result.
- [ ] **Step 4: Record.** Write every result to `deal.md` (hero id, palette, pairing, radius, nav, footer, close, rhythm, buttons, mark, moment, one sentence why the palette fits a software engineer) and into `plan.md` line 2. If a dealt part needs a photograph (`nav-cards`, `close-photo`, `media-band`), deal it again and write the swap and reason, per `sections.md` section 2.
- [ ] **Step 5: Plan the screens** in `plan.md`: one line per section id (hero, work, timeline, skills, about, contact-in-close), idea, picture kind (work: use, the `app-frame`; skills: parts; about: slot), screens (1 or 2), which section holds the moment. Read `cards.md` and the `sections-library.md` recipe of each id used.
- [ ] **Step 6: Tokens.** Paste the printed `:root` block into `src/index.css` between the fence comments. Keep `@import "tailwindcss"` first and the Tailwind import layered (Tailwind 4 puts its reset in `@layer base`, so the kit's unlayered CSS wins). Delete the old `@theme`/shadcn token blocks only if the admin plan has already replaced them; otherwise keep them below the fence and leave a `/* admin tokens: owned by admin plan */` comment.
- [ ] **Step 7:** Verify: `pnpm typecheck`. Expected: exit 0. Commit `feat(site): dealt palette, type and tokens`.

---

### Task 4: Static shell and build-time head

Model: SONNET

**Files:**
- Modify: `index.html`, `vite.config.ts`
- Create: `vite-plugins/site-head.ts`, `vite-plugins/site-head.test.ts`, `src/content/fallback.json`, `public/favicon.svg` (the dealt mark, replace old)

**Interfaces:**
- Produces: `siteHead(options: { fallbackPath: string; siteOrigin?: string }): Plugin`, with a `transformIndexHtml` hook.
- Produces: `buildPersonJsonLd(profile: PublicContent["profile"], origin?: string): Record<string, unknown>` exported from the plugin file.
- Produces: `fallback.json` typed as `PublicContent`.

- [ ] **Step 1: Failing tests** in `site-head.test.ts`:
  - `buildPersonJsonLd` returns `@context "https://schema.org"`, `@type "Person"`, `name`, `jobTitle` (= headline), `email`.
  - Null `linkedinUrl` and null `location` do not appear as keys; `sameAs` holds only non-null URLs.
  - With `origin` set, `url` equals the origin; without, no `url`.
  - Transformed HTML contains one `<script type="application/ld+json">` that `JSON.parse`s, contains `og:image` ending `/share.jpg` only when an origin is given, and a `link rel="canonical"` only with an origin.
  - No `<` of the JSON-LD text is left unescaped (`</script>` inside a string cannot close the tag).
  Run: `pnpm test vite-plugins`. Expected: FAIL.
- [ ] **Step 2: `fallback.json`.** A `PublicContent` snapshot made from contract section 8 seed content: profile (name, headline "AI Engineer", `PROFILE_INTRO`, `PROFILE_ABOUT`, email, GitHub, location "Jordan", available true, `availabilityText` null, `photoUrl` null, `photoKey` omitted per type, `cvUrl` null, `updatedAt`), the three projects as cards with no `imageKey`, both experience entries (AI Engineer with `company: null`, `startDate: null`, `current: true`), the education entry, the 14 skills with `iconSlug` values from Task 8. A type check (`satisfies PublicContent`, imported as a type from `@shared`) lives in `src/content/fallback.test.ts`: expects `profile.cvUrl === null` and that no experience with `current: true` has a company.
- [ ] **Step 3:** Implement the plugin: reads `fallback.json`, replaces `%SITE_NAME%`, `%SITE_HEADLINE%`, `%SITE_INTRO%`, the `<!--site:jsonld-->` slot and the origin-dependent tags. `siteOrigin` comes from `process.env.SITE_ORIGIN`. Escape `<` as `\u003c` in the JSON-LD.
- [ ] **Step 4: `index.html`.** Remove every Replit line (the "built on Replit" description, og/twitter copies, the Inter font link). Set `<html lang="en" data-type="software" data-radius data-buttons data-motion>` from `deal.md`, the three metas (`page-type`, `site-kind`, nothing for `page-kind`), the head block of `system.md` (title "Yazan Mohammad: AI Engineer", description, og, twitter, icon, `theme-color` = `--p-bg`, canonical injected by the plugin), the font links from `deal.md`, and the kit links of `starter.html` (`system.css`, `ui/cards.css`, `motion/motion.css`, `backgrounds/backgrounds.css`, `layout/layout.css`, `icons/icon.css`, `ui/base.css`) with paths starting `/assets/`, each `<link>` carrying `data-kit`. Keep the `m-enter` and `mo-js` inline lines from the starter. Inside `<div id="root">` put the static shell: skip link, `header.nav` with name, and the dealt hero's `<section class="hero" data-enter>` with the h1 (`%SITE_NAME%`, `%SITE_HEADLINE%`), the intro line and the primary button. It must use the same markup as `Hero.tsx` (Task 6) so the swap does not move anything. Copy `shoot.mjs`'s hero tile later (Task 12) as `public/share.jpg`.
- [ ] **Step 5:** Register `siteHead` in `vite.config.ts`. Run: `pnpm test vite-plugins src/content`. Expected: PASS. Run: `SITE_ORIGIN=https://www.yznmoh.com pnpm build`, then `grep -c 'ld+json' dist/index.html`. Expected: `1`. `grep -ci replit dist/index.html`. Expected: `0`.
- [ ] **Step 6:** Commit `feat(site): static shell, JSON-LD at build time, fallback snapshot`.

---

### Task 5: Data layer and kit loader

Model: SONNET

**Files:**
- Create: `src/lib/site/use-content.ts`, `src/lib/site/format.ts`, `src/lib/site/kit.ts`, and tests `use-content.test.tsx`, `format.test.ts` beside them
- Create: `src/test/utils.tsx` (`renderWithClient(ui, { path })`: `QueryClientProvider` with `retry: false` plus a wouter memory location; `makeApiError({ status, code, message, fields })`)

**Interfaces:**
- Consumes: `apiGet<T>(path)`, `ApiRequestError`, `PublicContent`, `PublicProject` (contract section 6, 3). `src/lib/api.ts` is built by the backend plan; if it is missing, stop and wait for it. Do not write it.
- Produces:
  ```ts
  useSiteContent(): { content: PublicContent; source: "api" | "fallback"; isPending: boolean }
  useProject(slug: string): UseQueryResult<PublicProject, ApiRequestError>   // key ["project", slug]
  formatRange(start: string | null, end: string | null, current: boolean): string | null
  hostLabel(url: string): string                  // "github.com/YazanMohammad" without protocol
  paragraphs(text: string): string[]              // split on blank lines, trim, drop empty
  setKitEnabled(on: boolean): void                // toggles every <link data-kit> via .disabled
  refreshKit(): Promise<void>                     // dynamic-imports the kit modules once, then calls their refresh/init
  ```

- [ ] **Step 1: Failing tests.**
  - `format.test.ts`: `formatRange("2024-09","2025-01",false)` is `"Sep 2024 – Jan 2025"`; `("2024-09",null,true)` is `"Since Sep 2024"`; `(null,null,true)` is `null`; `(null,"2025-01",false)` is `"Until Jan 2025"`; `(null,null,false)` is `null`; `paragraphs("a\n\n\nb ")` is `["a","b"]`; `hostLabel("https://github.com/YazanMohammad")` is `"github.com/YazanMohammad"`.
  - `use-content.test.tsx` (mock `@/lib/api` `apiGet`): resolves `content` → `source "api"` and the API's name; rejects with `makeApiError({status:500})` → `source "fallback"` and `content.profile.name === "Yazan Mohammad"`; a never-resolving promise → `isPending true` and `content` equals the snapshot (Review Focus 3); the query key is `["content"]`.
  Run: `pnpm test src/lib/site`. Expected: FAIL.
- [ ] **Step 2: Implement** `format.ts` and `use-content.ts` (`useQuery({ queryKey: ["content"], queryFn: () => apiGet<PublicContent>("/api/content"), staleTime: 60_000, retry: 1 })`; `content = data ?? fallback`).
- [ ] **Step 3: `kit.ts`.** Import the kit modules with `import(/* @vite-ignore */ url)` from `/assets/system.js`, `/assets/motion/motion.js`, `/assets/layout/layout.js`, plus the dealt moment's module path from `deal.md`. Before writing it, read each module's `init`: if calling `init()` twice is not safe, call it once and use the module's `refresh` (motion has `refresh`) for later renders; write which case applies in a code comment.
- [ ] **Step 4:** Run the tests. Expected: PASS. Commit `feat(site): content hooks, formatters, kit loader`.

---

### Task 6: Layout, nav, hero, photo slot, footer

Model: SONNET

**Files:**
- Create: `src/components/site/{SiteLayout,Nav,Hero,PhotoSlot,Footer}.tsx`, `Hero.test.tsx`, `PhotoSlot.test.tsx`

**Interfaces:**
- Consumes: `useSiteContent`, `siteCopy`, `setKitEnabled`, `refreshKit`.
- Produces:
  ```ts
  SiteLayout({ children, content }: { children: ReactNode; content: PublicContent }): JSX.Element
  Nav({ sections }: { sections: { id: string; label: string }[] }): JSX.Element   // only sections that exist
  Hero({ profile }: { profile: PublicContent["profile"] }): JSX.Element
  PhotoSlot({ profile, size }: { profile: PublicContent["profile"]; size: "hero" | "about" }): JSX.Element
  Footer({ profile }: { profile: PublicContent["profile"] }): JSX.Element
  ```

- [ ] **Step 1: Failing tests.**
  - `Hero.test.tsx`: with `cvUrl: null` there is no element with text "Download CV" (query by role `link`) and the primary "See my work"-style action is present; with `cvUrl: "/cv"` a link named "Download CV" has `href="/cv"`; `available: true` with `availabilityText: null` shows no status text; with `availabilityText: "Open to work"` it is shown; null `location` leaves no empty node (`container.querySelector(".hero__meta:empty")` is null); the email link is `mailto:` the profile email; the h1 contains the name or the headline as `deal.md` decides.
  - `PhotoSlot.test.tsx`: `photoUrl: null` renders the monogram tile (`role="img"`, `aria-label` "Yazan Mohammad", initials "YM"), no `<img>`; `photoUrl: "/api/files/x"` with `photoAlt: "Yazan at a desk"` renders one `<img>` with that alt and no monogram.
  Run: `pnpm test src/components/site`. Expected: FAIL.
- [ ] **Step 2: `SiteLayout`.** Calls `setKitEnabled(true)` on mount and `false` on unmount; calls `refreshKit()` in an effect after content or route changes; renders the skip link, `Nav`, `<main id="top">`, `Footer`. Nav main button is the filled primary; menu button and sheet as the dealt nav type needs.
- [ ] **Step 3: `Hero`.** The dealt hero's markup (`assets/layout/hero-<id>.html`, only its `<section class="hero" data-enter>`), identical structure to the static shell in `index.html`. Secondary "Download CV" rendered only when `cvUrl !== null`. The `app-frame` hero stage, if the dealt hero has one, shows live HTML of the real project list (from `content.projects`), never a drawn window. Availability as a plain status line, hidden when `available` is false and text is null.
- [ ] **Step 4: `PhotoSlot`.** Monogram tile at the photo's final ratio, in the dealt tokens, a comment `<!-- client file: profile photo, uploaded in admin -->`. No caption.
- [ ] **Step 5: `Footer`.** Dealt close and footer from their `<template>`s in `deal.md`; the one credits line only if the page uses photographs (it should not). Copyright with the current year, GitHub and LinkedIn links only when set.
- [ ] **Step 6:** Run tests. Expected: PASS. Commit `feat(site): layout, nav, hero, photo slot, footer`.

---

### Task 7: Selected work

Model: SONNET

**Files:**
- Create: `src/components/site/{WorkSection,ProjectFrame,ProjectCard,ProjectRow}.tsx`, `WorkSection.test.tsx`

**Interfaces:**
- Consumes: `ProjectCard` type from `@shared`, `fileUrl`, `hostLabel`.
- Produces:
  ```ts
  WorkSection({ projects }: { projects: ProjectCard[] }): JSX.Element | null   // null when projects is empty
  ProjectFrame({ project }: { project: ProjectCard }): JSX.Element             // image when imageKey set, else live HTML stand-in
  ```
  Featured projects (`featured: true`) use `ProjectCard`, large; the rest use `ProjectRow`, compact. Each links to `/projects/<slug>` with wouter `Link`.

- [ ] **Step 1: Failing tests.**
  - Empty `projects` renders nothing (`container` is empty), Review Focus 1.
  - A featured project with `imageKey: "k"` and `imageAlt: "Chat app screen"` renders an `<img>` whose `src` is `fileUrl("k")` and `alt` matches; with `imageKey: null` it renders a stand-in with `role="img"`, and the project title as `aria-label`.
  - A project with `liveUrl: null` and `githubUrl: null` renders no `<a href^="http">` and no empty link (Review Focus 2).
  - Technologies render as a list; an empty array renders no `<ul>`.
  - Non-featured projects render as rows, in the given order.
  - The card link `href` is `/projects/portfolio-v1` for slug `portfolio-v1`.
  Run: `pnpm test WorkSection`. Expected: FAIL.
- [ ] **Step 2: Implement.** Section recipe from `sections-library.md` for the id the plan assigned (an `app-frame` section if `plan.md` gave it to work). Stand-in: a live-HTML frame in the kit's window style showing title, category and the first five technologies as plain tags; no code window, no invented numbers. Card hover lift and photo zoom come from the motion layer; add no JS or CSS for them. External links open with `rel="noopener noreferrer"`.
- [ ] **Step 3:** Run tests. Expected: PASS. Commit `feat(site): selected work`.

---

### Task 8: Experience, education and skills

Model: SONNET

**Files:**
- Create: `src/components/site/{TimelineSection,SkillsSection}.tsx`, tests `TimelineSection.test.tsx`, `SkillsSection.test.tsx`, `src/content/icons.json`, `public/assets/icons/*.svg`

**Interfaces:**
- Produces:
  ```ts
  TimelineSection({ experience, education }: { experience: PublicContent["experience"]; education: PublicContent["education"] }): JSX.Element | null
  SkillsSection({ skills }: { skills: PublicContent["skills"] }): JSX.Element | null   // grouped by category, API order
  ```
- Consumes: `formatRange`, `icons.json` (`string[]` of slugs that have a file).

- [ ] **Step 1: Failing tests.**
  - Experience `{ position: "AI Engineer", company: null, startDate: null, current: true }` renders "AI Engineer" and no " at ", no dash, no date text, no "null" or "undefined" in `container.textContent`.
  - With company "Xocialive", dates 2024-09 to 2025-01 renders "Xocialive" and "Sep 2024 – Jan 2025"; bullets render as list items.
  - The first experience in the array renders first (current role first comes from the API; the component does not re-sort).
  - Education with `description: null` and `location: null` renders degree and school only.
  - Empty experience and empty education renders nothing; with only education it still renders the heading and education group (Review Focus 1).
  - Skills: grouped by `category` in first-seen order; a skill with `iconSlug` in `icons.json` renders an `<img alt="">` with `src` `/assets/icons/<slug>.svg`; a null or unknown slug renders text only; no element has `role="progressbar"` and no text matches `/\d+%/`; empty skills renders nothing.
  Run: `pnpm test TimelineSection SkillsSection`. Expected: FAIL.
- [ ] **Step 2: Icons.** List the slugs the seed will use (the backend plan sets `iconSlug`): `typescript`, `javascript`, `python`, `java`, `csharp`, `cplusplus`, `c`, `php`, `postgresql`, `react`, `dotnet`, `git`; `LLMs` and `SQL`-only names may stay null. Fetch real full-colour icons with `node <skill>/scripts/icons.mjs` (see `references/icons.md` for the exact subcommand), output `public/assets/icons`, write the slugs that exist to `src/content/icons.json`, and set the same `iconSlug` values in `fallback.json`. Never draw an icon.
- [ ] **Step 3: Implement.** One h2 "Experience and education" (copy from `siteCopy.timeline`), two groups. Skills: one list per category, name next to its icon, no levels. Use the plan's recipe for each (`rows`, `tile`).
- [ ] **Step 4:** Run tests. Expected: PASS. Commit `feat(site): timeline and skills`.

---

### Task 9: About and contact form

Model: SONNET

**Files:**
- Create: `src/components/site/{AboutSection,ContactSection,ContactForm}.tsx`, tests `AboutSection.test.tsx`, `ContactForm.test.tsx`

**Interfaces:**
- Consumes: `apiSend<{ ok: true }>("POST", "/api/messages", body: MessageInput)`, `ApiRequestError` (`status`, `code`, `fields`), `paragraphs`, `siteCopy.contact`.
- Produces:
  ```ts
  AboutSection({ profile }: { profile: PublicContent["profile"] }): JSX.Element | null  // null when about is empty
  ContactSection({ profile }: { profile: PublicContent["profile"] }): JSX.Element
  ContactForm(): JSX.Element
  ```
  The contact section is the dealt close's row 1 inside `footer.closing#contact` (the skill forbids `#contact` outside the footer). It shows the email as a `mailto:` link and the form.

- [ ] **Step 1: Failing tests (`ContactForm.test.tsx`, `apiSend` mocked).**
  - Submitting name, email, subject, message calls `apiSend` once with `("POST", "/api/messages", { name, email, subject, message, website: "" })`.
  - Empty subject is sent as `undefined` (key absent), not `""`.
  - Before the promise resolves, no success text is in the document and the submit button is disabled; after it resolves with `{ ok: true }` the text `siteCopy.contact.sent` appears in a `role="status"` node and the fields are cleared.
  - Rejecting with `makeApiError({ status: 400, code: "validation", fields: { email: "Write an email address with an @", message: "Write a message" } })`: each message appears under its own field, linked by `aria-describedby`, the field has `aria-invalid="true"`, the first failing field has focus, no success text, typed values stay.
  - Rejecting with `makeApiError({ status: 429, code: "rate_limited" })` shows `siteCopy.contact.rateLimited` in the status line, no field errors.
  - Rejecting with `new TypeError("Failed to fetch")` shows `siteCopy.contact.networkError` and keeps values (Review Focus 4).
  - Two rapid clicks on submit call `apiSend` once.
  - The honeypot input `name="website"` is not visible to keyboard users: `tabIndex=-1`, `aria-hidden` on its wrapper, `autocomplete="off"`; its label is not announced.
  - Each visible field has a `<label>`, and the email input is `type="email"` with `autocomplete="email"`.
  - `AboutSection.test.tsx`: empty `about` renders nothing; "a\n\nb" renders two `<p>`; with `photoUrl: null` the monogram slot shows.
  Run: `pnpm test AboutSection ContactForm`. Expected: FAIL.
- [ ] **Step 2: Implement.** `useMutation`-free state machine (`idle | sending | sent | failed`) is enough; errors from `err.fields` keyed by `name | email | subject | message`; a `fields` key the form does not show goes to the status line. No client-side validation beyond HTML `required`/`maxLength` (100, 200, 150, 5000 from the contract); the server answer is the truth. The form follows the starter's `booking-form` markup (`system.md`, Forms): visible labels, `.field__error`, one `.form__status[role=status]`. Do not let `system.js` swallow the submit: set `data-endpoint` off and handle `onSubmit` in React; if the kit's form handler still attaches, mark the form as the kit expects for a React-owned submit (read `system.js` form section first) and note it in a comment.
- [ ] **Step 3: About** with the `PhotoSlot size="about"` and the paragraphs. No caption under the photo.
- [ ] **Step 4:** Run tests. Expected: PASS. Commit `feat(site): about and contact form`.

---

### Task 10: Project page, Markdown, 404

Model: SONNET

**Files:**
- Create: `src/pages/site/{Project,NotFound}.tsx`, `src/components/site/Markdown.tsx`, tests `Markdown.test.tsx`, `Project.test.tsx`

**Interfaces:**
- Consumes: `useProject(slug)`, `useSiteContent` (for layout and footer), `fileUrl`.
- Produces:
  ```ts
  Markdown({ source }: { source: string }): JSX.Element          // react-markdown, no rehype-raw
  export default function Project(): JSX.Element                 // reads :slug via wouter useRoute("/projects/:slug")
  export default function NotFound(): JSX.Element
  ```

- [ ] **Step 1: Failing tests.**
  - `Markdown.test.tsx`: source `<script>alert(1)</script>` renders no `script` element and the text stays visible as text; `<img src=x onerror=alert(1)>` renders no `img`; `[x](javascript:alert(1))` has no `href` starting with `javascript:`; `# T` renders an `h2` (headings are shifted down one so the page keeps one `h1`); `[ok](https://example.com)` renders a link with `rel="noopener noreferrer"`; a 500-character code line sits in a `pre` with `overflow-x: auto` set through a class the CSS defines (Review Focus 5).
  - `Project.test.tsx` (mock `apiGet`): resolved project shows title, summary, role (only when not null), technologies, a "View live" link only when `liveUrl` set, a "View code" link only when `githubUrl` set, the image with `alt` when `imageUrl` set, and the Markdown body; `body: ""` renders no empty section; `makeApiError({status:404,code:"not_found"})` renders the NotFound view (`siteCopy.project.notFound.heading`) and sets `document.title` containing "not found"; `status: 500` renders `siteCopy.project.loadError` with a back link, never a blank page; while pending, the title and the back link are still present when the slug matches a card in the snapshot.
  - `document.title` equals `"<title> | Yazan Mohammad"` on success (React 19 `<title>` in the component).
  Run: `pnpm test Markdown Project`. Expected: FAIL.
- [ ] **Step 2: Implement.** `Markdown` uses `react-markdown` with `components` for `a`, `h1..h3`, `pre`, `img` (images only from `https:` or `/api/files/`), `urlTransform` left at the default, no `rehype-raw`, no `dangerouslySetInnerHTML` anywhere in `src/components/site` or `src/pages/site` (a test greps for it: `search_files` for `dangerouslySetInnerHTML` returns no hit). Project page layout follows the plan's recipe: back link, h1, summary, a facts row (role, stack, links), image, body at `.measure` width. Page title and meta description via React 19 `<title>`/`<meta>`.
- [ ] **Step 3: `NotFound`** with `siteCopy.notFound`, one action back to `/`, inside `SiteLayout` with `sections: []`.
- [ ] **Step 4:** Run tests. Expected: PASS. Commit `feat(site): project page, markdown, 404`.

---

### Task 11: Home assembly and dealt moment

Model: SONNET

**Files:**
- Create: `src/pages/site/Home.tsx`, `Home.test.tsx`
- Modify: `.taste-skill/plan.md` (moment's section named)

**Interfaces:**
- Produces: `export default function Home(): JSX.Element` that renders, in order: `Hero`, `WorkSection`, `TimelineSection`, `SkillsSection`, `AboutSection`, the close with `ContactSection`; passes only the section ids that rendered to `Nav`.

- [ ] **Step 1: Failing tests (`apiGet` mocked).**
  - With the API resolved, the six sections' headings appear in spec order (`getAllByRole("heading", { level: 2 })` text order matches `siteCopy`).
  - API rejects with 500: the page renders the snapshot's name and intro, `source` fallback, and no Download CV link.
  - API resolves with `projects: []`, `skills: []`, `about: ""`: no heading for work, skills or about, and the nav has no "Work", "Skills" or "About" link (Review Focus 1).
  - `cvUrl: "/cv"` and `photoUrl: "/api/files/p"` show the CV link and the photo.
  - `document.title` is "Yazan Mohammad: AI Engineer" or the title in `index.html`.
  Run: `pnpm test Home`. Expected: FAIL.
- [ ] **Step 2: Implement `Home`.** Mount the dealt moment in the section `plan.md` named, copied from `assets/moments/_demo/in-page.html` as `moments.md` says, never from a script of your own; its text comes from `siteCopy`/content. Under reduced motion everything must rest and stay visible.
- [ ] **Step 3:** Run all site tests: `pnpm test`. Expected: PASS. Commit `feat(site): home page and moment`.

---

### Task 12: Check, look, gate

Model: SONNET

**Files:**
- Create: `public/share.jpg`, `.taste-skill/report.md`, `.taste-skill/waivers.json` (only if a FAIL is false)
- Modify: any site file the checks flag (never kit files)

**Interfaces:** none.

Content under check: use `netlify dev` (`http://localhost:8888/`) once the backend plan's functions and seed are in; otherwise the Vite URL (`http://localhost:5173/`), which shows the snapshot. State which one in the report. The hero with a CV present is the production layout: when the page runs on the snapshot, also run one pass with a local copy of the page where `cvUrl` is `"/cv"` (a temporary local edit of the snapshot, reverted before the commit) and shoot 1440 and 390.

- [ ] **Step 1: Icons last.** `node <skill>/scripts/icons.mjs scan <built or served html> --out public/assets/icons --colour` so every icon the page names is a local file. (The page is React-rendered: scan the served URL or the built `dist/index.html` plus `icons.json`; if the scan cannot read React output, list the slugs by hand and confirm each file exists.)
- [ ] **Step 2: Copy check.** `node <skill>/scripts/copy-lint.mjs <served page> --kind software`. Expected: no FAIL. Fix every WARN or keep it and say why in the report. Read the copy aloud (`copy-voice.md` section 6).
- [ ] **Step 3: Checks, one at a time in the foreground, 10-minute timeout, `--profile .taste-skill/chrome-check`:**
  ```
  node <skill>/scripts/consistency.mjs <url> --widths 1440,1024,820,768,390 --rhythm-widths 1440,820,768,390 --page software --category "software and AI engineer portfolio" --primary "<main action>"
  node <skill>/assets/layout/check.mjs --url <url> --sizes 1440x900,1024x768,820x1180,768x1024,390x844 --shots shots/layout
  node <skill>/scripts/shoot.mjs --url <url> --w 1440 --out shots/1440.png
  node <skill>/scripts/perf.mjs <url>
  ```
  Shoot 1024, 820x1180, 768x1024 and 390 too. Expected: no FAIL rows. Read every screenshot against the checklist in `SKILL.md` section 5 (one section per screen, equal edges, every visual draws, hover/press present, hero enters once).
- [ ] **Step 4:** Copy the hero tile from `shoot.mjs` output (`tiles/desktop-sec-01-a.jpg`) to `public/share.jpg`.
- [ ] **Step 5: Gate**, up to three rounds. Run `node <skill>/scripts/gate.mjs <url>`; fix what it lists; `consistency.mjs --quick --widths 1440,390` between rounds. Stop at `GATE: PASS` or `GATE: OPEN`. `GATE: SETUP` means the URL was not reachable: start the server and rerun. `GATE: ERROR` or `OFF`: put the line in the report and stop.
- [ ] **Step 6: Report** in `.taste-skill/report.md`, in the order of `SKILL.md` step 7: the `GATE:` line first; waivers with reasons; the deal; voice card in one line; kept WARNs; checker, layout and perf results; what could not be checked; assumed facts (expected: none); the client slots (profile photo slot, project images, CV) and their stand-ins.
- [ ] **Step 7:** Run `pnpm test` and `pnpm typecheck`. Expected: PASS and exit 0. Commit `feat(site): checks, share image, gate report`.

---

### Task 13: Confirm routes and leftover public code

Model: HAIKU

Task 0 (contract section 10) already deleted the old section components, `src/pages/portfolio.tsx`, the old index pages and the Replit files. This task only checks the handoff and what Task 0 left.

**Files:**
- Delete (only if still present and unreferenced): `src/pages/not-found.tsx`, the unused `public/yazan.png` and `public/preview-*.png` (only if `db/seed.ts` already copies them; check its references first, otherwise leave them), `src/components/ui/*` files nothing imports (done together with the admin plan's cleanup; skip files it already removed)

**Interfaces:**
- Consumes: the admin plan's `App.tsx` (routes handed over above).

- [ ] **Step 1: Check the handoff.** Run: `rg -n "pages/(portfolio|not-found)|components/(About|Contact|Experience|Footer|Hero|Nav|Projects|Skills)\b" src`. Expected: no hit. If `App.tsx` still imports old pages, stop and report: the admin plan has not switched yet. Do not edit `App.tsx`.
- [ ] **Step 2:** Run `rg -n "pages/site/(Home|Project|NotFound)" src/App.tsx`. Expected: three hits.
- [ ] **Step 3:** Unused UI check: for each file in `src/components/ui/`, `rg -l "components/ui/<name>" src` outside `src/components/ui`; delete files with no importer (mark "done by Task 0 / admin plan" if none are left). Run: `pnpm typecheck` then `pnpm build`. Expected: both exit 0. `rg -in "replit|supabase" index.html src/pages/site src/components/site`. Expected: no hits.
- [ ] **Step 4:** Commit `chore(site): remove leftover public code` (skip when nothing changed).

---

## Self-review

- **Spec coverage (section 11):** kind and sections (Tasks 2, 3, 11); hero with availability, actions, email (6); work with image or live stand-in (7); timeline, current role first, null hiding (8); skills with real icons, no levels (8); about and photo slot (6, 9); contact form with per-field errors, success after 201, 429, honeypot (9); project page, safe Markdown (10); static shell, snapshot fallback (4, 5); SEO and JSON-LD at build time (4); copy and seed text (2); gate until PASS or OPEN (12); old components and Replit meta removed (1, 4, 13); tests (5 to 11). Spec section 16: CV hidden when null (6), nulls hidden (6, 8), snapshot skips empty fields (4).
- **Names:** `useSiteContent`, `useProject`, `formatRange`, `paragraphs`, `hostLabel`, `setKitEnabled`, `refreshKit`, `siteCopy`, `PROFILE_INTRO`, `PROFILE_ABOUT`, the component names above, and the contract names are used with one spelling throughout.
- **Proportion:** about 1.2x the spec; code appears only as signatures.
- **Open risks, not hidden:** the skill's kit assumes a static page and its scripts attach at load; Task 5 step 3 and Task 9 step 2 carry the check of what is safe to re-run. The skill forbids `#contact` outside the footer, so the form lives in the close.
