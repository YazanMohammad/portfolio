# Portfolio V2 redesign: design

Date: 2026-11-25
Owner: Yazan Mohammad
Status: draft, waiting for approval

## 1. Why

The current site (`artifacts/portfolio`) is a generic AI-template portfolio: dark navy, teal-to-violet
gradient text, glows, a grid backdrop, a fake `developer.tsx` code window, skill percentage bars and a
typing headline. Its content is also out of date (the last role shown is an internship that ended in
Jan 2025). The admin panel at `/admin` looks finished but does nothing: edits are saved only in the
editor's own browser (`localStorage`), the public page never reads them, and the login can be bypassed
from the browser console.

Yazan wants:

- a public site that is as good as it can be, and that works for three readers at once:
  recruiters (who he is, current role, CV in one click), clients (what he can build for them, how to
  reach him) and engineers (real projects, stack, code links);
- an admin dashboard that looks better, is easier to use, and actually controls what the site shows;
- the database hosted on Neon.

## 2. Goals

1. New public site design, built with the `design-taste-frontend` skill and passing its gate.
2. All public content comes from the database and is edited from the admin.
3. A working, secure admin: one admin user (Yazan), real login, every write checked on the server.
4. Contact form saves real messages that show up in the admin inbox.
5. Image and CV uploads from the admin.
6. Runs on free tiers: Netlify (site + functions + blobs) and Neon (Postgres).

## 3. Non-goals

- Arabic / RTL. English only for now. Keep copy in one place so a translation can be added later.
- Blog and testimonials. Removed from the admin and the schema.
- Email notification for new messages (could be added later with a mail service).
- Multiple admin users, sign-up, password reset by email.
- Changing `artifacts/mockup-sandbox`. Left as it is.

## 4. Anti-goals (a failure even if it works)

- Looks like a template again: gradient text, glows, violet, fake code windows, skill percentages,
  "passionate: true", inflated stats ("20+ technologies"), typing headlines.
- Copy that sounds AI-written. Yazan dislikes jargon, filler and inflated phrasing. Plain sentences.
- Any way to change content without logging in, or a database credential reaching the browser.
- Invented facts: no made-up metrics, clients, quotes or dates. Unknown facts stay marked as unknown.
- An admin that is harder to use than editing a file.

## 5. Constraints

- Keep the stack: pnpm monorepo, Vite + React 19 + TypeScript + Tailwind 4, wouter, TanStack Query,
  Drizzle. Deployed on Netlify from GitHub (`YazanMohammad/portfolioV2`).
- `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440`. Do not disable it. New packages must be
  at least a day old.
- No photo of Yazan yet. The design leaves a slot that reads finished without a photo and fills when
  he uploads one from the admin.
- Known content: name Yazan Mohammad; current role "AI Engineer" (company and start date unknown,
  to be filled in from the admin); past role Software Engineering Intern at Xocialive
  (Sep 2024 to Jan 2025); B.S. Computer Science, Zarqa University (2021 to 2024); email
  ybmoh03@gmail.com; GitHub @YazanMohammad; CV currently at a Supabase URL (to be re-uploaded to the
  new storage); projects Portfolio V1, Chat App, Tic-Tac-Toe (more to be added from the admin).

## 6. Approaches considered

| Approach | Trade-off | Decision |
|---|---|---|
| Supabase (DB + auth + storage) | Least code, but Yazan wants the DB on Neon, and Supabase can't use an outside database. | Dropped |
| **A1. Neon + Netlify Functions + Netlify Blobs** | Small API to write, but reuses the Drizzle schema, keeps DB credentials on the server, and puts security in one place. Nothing extra to host. | **Chosen by Yazan** |
| A2. Neon Data API + Neon Auth (browser talks to the DB) | No API code, but security depends on a correct row policy on every table; Neon Auth allows public sign-up by default; still needs a function for files. | Dropped |
| Own Express API on the Oracle VPS | Uses existing code, but a server to run, patch and back up; site breaks when the VPS is down. | Dropped |
| Content in a file in the repo, no admin | Simplest and safest, but drops the admin Yazan asked for. | Dropped |

## 7. Architecture

```
Browser ──► Netlify CDN ──► static site (Vite build)
   │
   └─► /api/* ──► Netlify Functions ──► Neon Postgres (pooled connection)
                        └────────────► Netlify Blobs (images, CV)
```

- **Functions** live in `netlify/functions/` at the repo root, one file per area
  (`content.ts`, `auth.ts`, `admin-*.ts`, `messages.ts`, `files.ts`), using the modern function format
  (`export default async (req: Request, context: Context)` with `config.path`). Shared server code
  (DB client, auth helpers, validation) lives in a new workspace package `lib/server`.
- **Database driver:** `@neondatabase/serverless` with `drizzle-orm/neon-http`. `lib/db` keeps the
  schema; its `index.ts` switches from `pg` Pool to the Neon HTTP driver.
- **The Express `artifacts/api-server` is removed** once the functions replace it.
- **Local development:** `netlify dev` runs Vite and the functions together, against a Neon dev
  branch.
- **Region:** Neon project in AWS Frankfurt (`aws-eu-central-1`), closest to Jordan. If the Netlify
  plan allows choosing the functions region, set it to the same region; otherwise leave the default.

## 8. Data model

Changes to `lib/db/src/schema/entities.ts`:

- **Remove** `testimonials`, `blog_posts`, `settings`, and the old `users` table with its plain-text
  password.
- **Add `profile`** (single row): name, headline (e.g. "AI Engineer"), short intro (hero line), about
  text, location, email, GitHub URL, LinkedIn URL (optional), availability flag + short status text,
  photo file key (nullable), CV file key (nullable), updated at.
- **`projects`**: add `slug` (unique), `summary` (one line for cards), `body` (longer write-up,
  Markdown), `role` (what Yazan did, optional); change `technologies` from a comma string to `text[]`;
  `image_url` becomes `image_key` (a Blobs key) with an optional `image_alt`. Keep `category`,
  `featured`, `is_visible`, `sort_order`, links.
- **`experience`** and **`education`**: dates as `date` columns (month precision is enough; store the
  1st of the month), `is_visible`, `sort_order`; experience description becomes a list of bullet
  strings (`text[]`) instead of one string with "•".
- **`skills`**: keep name, category, sort order; drop `show_in_hero`; add `is_visible`.
- **`messages`**: keep; add `archived_at` (nullable) and `ip_hash` (for rate limiting, a salted hash,
  never the raw IP).
- **Add `login_attempts`**: ip hash, time, success flag. Used to slow down password guessing.
- **Add `admin_sessions`**: session id (random, 32 bytes), created at, expires at, last seen. Lets
  logout and "log out everywhere" actually work.

Migrations: `drizzle-kit generate` into `lib/db/migrations/` (committed), applied with
`drizzle-kit migrate` using the direct (non-pooled) Neon URL. Never `drizzle-kit push` against
production. A seed script loads the content listed in section 5.

## 9. API

All bodies are JSON and validated with Zod schemas shared in `lib/api-zod` (used by both the
functions and the frontend forms).

Public:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/content` | Everything the public page needs in one call: profile, visible projects, experience, education, skills. Cached at the CDN; the cache is purged by tag whenever the admin saves. |
| GET | `/api/projects/:slug` | One project with its full write-up. Cached the same way. |
| POST | `/api/messages` | Contact form. Rate limited, honeypot field, length limits. |
| GET | `/api/files/:key` | Serves an uploaded image or the CV from Blobs with long cache headers. |
| GET | `/cv` | Redirects to the current CV file. Gives a stable link to put on LinkedIn. |

Admin (all need a valid session):

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/login` | Password in, session cookie out. |
| POST | `/api/auth/logout` | Ends the session. |
| GET | `/api/auth/me` | Is the session valid. Used by the admin to guard routes. |
| GET/PUT | `/api/admin/profile` | Read and update the profile row. |
| GET/POST | `/api/admin/{projects,experience,education,skills}` | List and create. |
| PUT/DELETE | `/api/admin/{...}/:id` | Update and delete. |
| PUT | `/api/admin/{...}/order` | Save a new order after drag-and-drop (list of ids). |
| GET | `/api/admin/messages` | Inbox, filter by unread / archived. |
| PATCH/DELETE | `/api/admin/messages/:id` | Mark read/unread, archive, delete. |
| POST | `/api/admin/files` | Upload an image or a PDF. Returns its key. |
| GET | `/api/admin/summary` | Counts and recent messages for the dashboard. |

## 10. Security (Opus writes and reviews this part)

- **One admin user.** No users table. The password hash lives in the Netlify env var
  `ADMIN_PASSWORD_HASH`, made with `scrypt` from `node:crypto` (no extra dependency), with a script
  `pnpm admin:hash` to generate it. Compare with a constant-time check.
- **Sessions:** a random session id stored in `admin_sessions`, sent as a cookie
  `__Host-session` with `HttpOnly; Secure; SameSite=Strict; Path=/`, 7-day expiry, renewed on use.
  Logout deletes the row.
- **Every admin function** starts with the same `requireAdmin(req)` helper. No admin route without it.
  A test lists all admin routes and checks each one returns 401 without a session.
- **Cross-site requests:** besides `SameSite=Strict`, every write checks that the `Origin` header
  matches the site's own origin.
- **Login slow-down:** after 5 failed attempts from one IP hash in 15 minutes, refuse logins from it
  for 15 minutes. Failed logins wait a fixed time before answering.
- **Contact form abuse:** honeypot field, max 3 messages per IP hash per hour, length limits
  (name 100, email 200, subject 150, message 5000 characters).
- **Uploads:** admin only; images (JPEG, PNG, WebP) and PDF up to 4 MB each (Netlify caps function request bodies at about 6 MB); type checked from the
  file's first bytes, not the name; stored under a random key; served with
  `X-Content-Type-Options: nosniff`. No SVG uploads (they can carry scripts).
- **Headers** in `netlify.toml`: a Content-Security-Policy, `Referrer-Policy`, `X-Frame-Options: DENY`,
  `Permissions-Policy`.
- **Secrets** only in Netlify env vars: `DATABASE_URL`, `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`
  (used to salt IP hashes). `.env` stays git-ignored. The old Supabase CV URL and the Replit-era
  `admin_token` logic are removed.

## 11. Public site

Built with the `design-taste-frontend` skill, inside the existing Vite/React app, following its run
(read the brief, write all copy first, deal the hero/palette/type, build, check, gate).

- **Kind:** software (a person who builds software and AI systems, so the page shows real software).
  This is a builder's call within the skill if its checker disagrees.
- **What goes away:** everything in section 4's list, and the current `src/components/*` section
  components (replaced, not restyled).
- **Sections, in order:**
  1. **Hero:** name, "AI Engineer", one plain line on what he builds, availability status from the
     profile, actions "See my work" and "Download CV"; email link.
  2. **Selected work:** featured projects large, each with its image (or a live HTML stand-in when a
     project has no image), summary, stack and links; the rest as a compact list.
  3. **Experience and education:** a plain timeline from the database; the current role first.
  4. **Skills:** grouped lists with real tool icons. No percentages, no levels.
  5. **About:** the about text and the photo slot.
  6. **Contact:** the form (real send, errors under each field, success only after the server answers)
     and the email address.
- **Project page** `/projects/:slug`: the full write-up for engineers (problem, what he built, stack,
  links, images). Markdown rendered safely (no raw HTML).
- **Loading:** the page shell, name, headline and meta tags are in the static HTML so the first screen
  never shows blank; content fills in from `/api/content`. If the API is down, a small bundled
  snapshot of the content is shown instead.
- **Copy:** plain, specific, short. Nothing invented. Every unknown fact marked in the admin as
  "to fill in", never written as a guess on the public page.
- **SEO:** title, description, Open Graph image, and a JSON-LD `Person` block, filled at build time
  from the seed content.

## 12. Admin

Same visual system as the public site (same type, colours and spacing), but denser and calmer.

- **Layout:** left sidebar with Dashboard, Profile, Projects, Experience, Education, Skills, Messages
  (unread count); top bar with "View site" and log out. Collapses to a drawer on phones.
- **Dashboard:** unread messages with the newest three, counts per section, items marked
  "to fill in", last saved time.
- **Profile page:** one form for everything in the hero and about sections, plus photo and CV upload,
  with a live preview of the hero next to it.
- **Lists (projects, experience, education, skills):** drag to reorder, show/hide switch on each row,
  click a row to edit in a side panel (no stacked modals), duplicate, delete with a confirm.
- **Forms:** shared field components; tags input for technologies; month/year pickers with a
  "current role" switch; image drop zone with preview and alt text; Markdown editor with preview for
  project write-ups; errors next to each field from the shared Zod schemas.
- **Saving:** explicit Save button plus Ctrl/Cmd+S; a warning before leaving with unsaved changes;
  a toast on save; saving purges the public cache so the change shows at once.
- **Messages:** list with unread first, open to read (marks it read), reply opens the mail app with
  the address and subject filled in, archive, delete.
- **Login page:** password only, clear error, shows the slow-down message when it applies.
- **Accessibility:** works by keyboard, visible focus, labels on every field.

## 13. Testing

- Unit tests (Vitest): password hashing and checking, session create/expire, rate limits, upload type
  checks, Zod schemas.
- API tests against a Neon test branch: every admin route returns 401 without a session; CRUD works
  with one; the contact form rejects spam and over-limit sends.
- Frontend: component tests for the admin forms; a Playwright smoke test for login, edit a project,
  see it on the public page, send a message, see it in the inbox.
- The `design-taste-frontend` gate on the public page until `GATE: PASS`.
- `pnpm typecheck` and `pnpm build` clean.

## 14. Work split (for parallel building)

1. **Contract first** (Opus): the Drizzle schema, Zod schemas in `lib/api-zod`, the route list above
   as TypeScript types. Everything else builds against this.
2. **Backend** (Sonnet; auth and uploads by Opus): `netlify/functions/`, `lib/server`, migrations,
   seed script.
3. **Public site** (Sonnet with the taste skill): `src/pages/site/*`, `src/components/site/*`.
4. **Admin** (Sonnet): `src/pages/admin/*`, `src/components/admin/*`.
5. **Chores** (Haiku): delete the old Express server, blog/testimonial pages, the `localStorage`
   store, unused Radix/shadcn components, Replit leftovers in `vite.config.ts` and `index.html`.
6. **Final review** (Opus): security review of section 10 and a review of the whole diff before merge.

Steps 2 to 4 own separate folders, so they can run at the same time once step 1 is done.

## 15. What Yazan has to do

- Create a Neon project (Frankfurt) and give the connection strings to Netlify as env vars.
- Run `pnpm admin:hash` locally and put the result in Netlify as `ADMIN_PASSWORD_HASH`.
- After launch: fill in the current company and start date, add projects, upload the CV and,
  later, a photo.

## 16. Decisions from the review

Questions a reviewer raised, settled here (marked as calls made by the planner unless noted):

- **Cache:** `/api/content` and `/api/projects/:slug` send `Netlify-CDN-Cache-Control` with cache tags;
  admin saves call `purgeCache({ tags })` from `@netlify/functions`. If purge fails, the response
  still carries `max-age=60, stale-while-revalidate=300`, so an edit shows within about a minute at
  worst.
- **Files:** every uploaded file is public (images and the CV; nothing private goes in Blobs).
  `/api/files/:key` sends `Cache-Control: public, max-age=31536000, immutable`, so the CDN serves
  repeat views and the function is rarely hit. Replacing a photo, project image or CV deletes the old
  blob. Old CV links keep working only through `/cv`.
- **No CV yet:** the Download CV button is hidden and `/cv` returns 404 until one is uploaded.
- **Unknown facts:** stored as `NULL`. The public page hides any empty field (a role with no company
  shows just "AI Engineer"; no start date shows no dates). The admin's "to fill in" list is computed
  from empty fields that the public page would show. The JSON-LD and fallback snapshot skip empty
  fields too.
- **OpenAPI and Orval:** removed (`lib/api-spec`, `lib/api-client-react`, Orval config). The Zod
  schemas in `lib/api-zod` are the one source of truth, written by hand; the frontend calls the API
  with a small typed fetch helper.
- **Existing data:** none to migrate. The Replit-era database was never deployed (Netlify serves a
  static build), so production starts from the seed script.
- **Transactions:** stay on the Neon HTTP driver and use `db.batch()` for multi-statement writes
  (reorder, rate-limit check + insert). Switch a single function to the WebSocket driver only if a
  real interactive transaction is needed.
- **Build and CI:** in scope. Commit `pnpm-lock.yaml` again and build with a frozen lockfile; drop
  the `PORT`/`BASE_PATH` requirement for production builds; functions bundled by Netlify with
  `node_bundler = "esbuild"` and workspace packages resolved through pnpm.
- **Migrations on production:** run by hand with `pnpm db:migrate` (direct Neon URL) before merging a
  schema change. Not run automatically in the Netlify build.
- **Domain (decided by Yazan):** V2 replaces V1 at `yznmoh.com`. Canonical origin
  `https://www.yznmoh.com` (the address V1 already uses), with the bare domain redirecting to it.
  The origin is read from a `SITE_ORIGIN` env var, so V2 can be built and tested on its
  `*.netlify.app` address first and switched over by moving the domain to the Netlify site once it
  passes. V1's CV is copied from its Supabase URL into Blobs by the seed script.
- **Preview deploys:** read-only. Login works only on the production origin (the `Origin` check and
  `__Host-` cookie are tied to it). Previews use a separate Neon branch.

## 17. Left to the builder

- Exact file names inside the folders above, component breakdown, and query-key design.
- Which Markdown and drag-and-drop libraries (must pass the 1-day release-age rule).
- The visual deal (palette, type pairing, hero layout, moments): dealt by the taste skill, not chosen
  here.
- Whether the bundled fallback snapshot is generated at build time or committed.
