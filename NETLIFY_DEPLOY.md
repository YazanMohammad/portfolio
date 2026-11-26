# Deploying to Netlify

`netlify.toml` holds the build, functions, redirects and security headers. You do not type them in the UI.

## Steps

1. Push the repo to GitHub.
2. In Netlify: **Add new site → Import an existing project**, pick the repo.
3. Leave the build settings as they are. They come from `netlify.toml`:
   build `pnpm install --frozen-lockfile && pnpm build`, publish `dist`, Node 22.
4. Set the environment variables below. Give each one the scopes **Builds** and **Functions**.
5. Run the production migration and seed (see below), then deploy.
6. Add the custom domain: `www.yznmoh.com` as primary, `yznmoh.com` as an alias. Wait for HTTPS.

## Environment variables

Set these in **Site configuration → Environment variables**. Names only here. Keep the values secret.

| Name | What it is |
|---|---|
| `DATABASE_URL` | Neon main branch, **pooled** connection string (the host contains `-pooler`) |
| `ADMIN_PASSWORD_HASH` | scrypt hash of the admin password. Make it locally with `pnpm admin:hash` and paste the whole `scrypt$…` string |
| `SESSION_SECRET` | Base64 of 32 random bytes. Make it with the command below. It also keys the IP hash for rate limits |
| `SITE_ORIGIN` | The exact production origin: `https://www.yznmoh.com`. No trailing slash |

Make `SESSION_SECRET` with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Do not use a hex string or a password. If the value is not base64 of at least 32 bytes, login and the contact form return 500, and the function log says so.

### `SITE_ORIGIN`

- It must match the site's address byte for byte. `https://www.yznmoh.com/` (with a slash) will not work.
- It is read at **build** time (canonical and `og:image` tags) and at **run** time (the origin check in functions). So it needs both scopes.
- Admin writes, login and the contact form check the browser's origin against it. They return **403** on `*.netlify.app` URLs and deploy previews. This is on purpose.
- Test the admin only on the production domain.

Netlify gives functions access to Blobs on its own. You do not set any Blobs variable in Netlify.

## Production database

Run these on your own machine, not on Netlify. Put the values in the local `.env`. Never commit it.

1. **Migrate.** `pnpm db:migrate` reads `DATABASE_URL_UNPOOLED`. Set it to the Neon main branch **direct** (not pooled) URL. Never use `drizzle-kit push`.
2. **Seed.** `pnpm db:seed` also writes the CV and images to Netlify Blobs, so it needs:
   - `DATABASE_URL`: the main pooled URL.
   - `BLOBS_SITE_ID`: in Netlify, **Site configuration → Site details → Site ID**.
   - `BLOBS_TOKEN`: a personal access token. Create one in Netlify under **User settings → Applications → Personal access tokens**.
   - `CV_PATH` (optional, local seed only): absolute path to the CV PDF. If unset, the seed uses
     `C:/Projects/Personal/CV maker/master/Yazan_Mohammad_CV.pdf` when present, otherwise the legacy CV URL.
     An explicit missing/invalid path does not fall back to an older CV. Both local and downloaded
     files must have a PDF signature and be at most 4 MB. Keep the PDF outside the repo; do not commit it.
3. If your shell exports a different `DATABASE_URL` than `.env`, run `env -u DATABASE_URL pnpm db:seed`. Otherwise run `pnpm db:seed`. Do not pass `--force`.
4. When it finishes, delete `BLOBS_TOKEN` from `.env` and revoke the token in Netlify.

Other local-only names: `DATABASE_URL_TEST` and `DATABASE_URL_TEST_UNPOOLED` for `pnpm test:db`.

## Local check

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm dev        # netlify dev on http://localhost:8888, runs Vite on 5173
```

- If your shell already exports `DATABASE_URL`, run `env -u DATABASE_URL pnpm dev`. `netlify dev` lets shell variables beat `.env`.
- On Windows, pnpm links `node_modules` with symlinks. That needs Developer Mode or an elevated shell. Without either, use a clone with a flat `node_modules`: `pnpm install --frozen-lockfile --config.node-linker=hoisted`.
- Locally, set `SITE_ORIGIN` to `http://localhost:8888`. The local session cookie is only allowed for a loopback `http` origin.

## Troubleshooting

| Problem | Fix |
|---|---|
| `Missing environment variable: X` in a function | Add `X` in Netlify with the Functions scope and redeploy |
| Login or contact form returns 500 | Check `SESSION_SECRET` is base64 of 32 bytes. The function log names it |
| Admin save or contact form returns 403 | You are on a `*.netlify.app` URL, or `SITE_ORIGIN` is not exact |
| `/api/...` returns HTML | Check the `/api/*` redirect is before `/*` in `netlify.toml` |
| Page 404 on refresh | Check the `/* → /index.html` redirect is last |
