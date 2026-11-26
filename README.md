# Portfolio V2

Personal portfolio site with a small admin. React, Vite and Tailwind on the front end. Netlify Functions, Neon Postgres (Drizzle) and Netlify Blobs on the back end.

## Setup

Needs Node 22 and pnpm. Copy `.env.example` to `.env` and fill in the names. See `NETLIFY_DEPLOY.md` for what each one is.

```bash
pnpm install
pnpm dev                       # netlify dev on http://localhost:8888
env -u DATABASE_URL pnpm dev   # use this if your shell already exports DATABASE_URL
```

## Scripts

| Script | What it does |
|---|---|
| `pnpm dev` | Netlify dev: functions plus Vite |
| `pnpm dev:web` | Vite only, no API |
| `pnpm build` | Typecheck, then Vite build into `dist` |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Unit and component tests. No backend needed |
| `pnpm test:api` | API handler tests |
| `pnpm test:db` | Tests that use a real Postgres. Needs `DATABASE_URL_TEST` and `DATABASE_URL_TEST_UNPOOLED` (a test branch, never production) |
| `pnpm e2e` | Playwright smoke test |
| `pnpm db:generate` | Generate a migration from `db/schema` |
| `pnpm db:migrate` | Apply migrations. Uses `DATABASE_URL_UNPOOLED` |
| `pnpm db:migrate:test` | Apply migrations to the test branch |
| `pnpm db:seed` | Seed profile, projects and files |
| `pnpm admin:hash` | Make the value for `ADMIN_PASSWORD_HASH` |

## Layout

- `src/`: the React app (public site in `pages/site`, admin in `pages/admin`)
- `server/`: shared server code (sessions, origin check, rate limits, uploads)
- `netlify/functions/`: one file per API route
- `shared/`: Zod schemas used by both sides
- `db/`: schema, migrations, seed

## Admin tests

`pnpm test` runs the unit and component tests (no backend needed).

`pnpm e2e` runs the Playwright smoke test in `e2e/`. It needs `netlify dev` running and `E2E_ADMIN_PASSWORD` set, and skips otherwise. It uses the installed Chrome (`channel: "chrome"`), so no browser download is needed. Run it against a test database, not production: it edits a project and sends a contact message, then restores and deletes them.

## Deploy

See `NETLIFY_DEPLOY.md`.
