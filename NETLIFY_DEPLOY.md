# Deploying to Netlify

`netlify.toml` holds the build, functions, redirects and security headers. You do not type them in the UI.

## Steps

1. Push the repo to GitHub.
2. In Netlify: **Add new site → Import an existing project**, pick the repo.
3. Leave the build settings as they are. They come from `netlify.toml`:
   build `pnpm install --frozen-lockfile && pnpm build`, publish `dist`, Node 22.
4. Set the environment variables below. Give each one the scopes **Builds** and **Functions**.
5. Run the production migration and seed, then create the admin account (see below). Then deploy.
6. Add the custom domain: `www.yznmoh.com` as primary, `yznmoh.com` as an alias. Wait for HTTPS.

## Environment variables

Set these in **Site configuration → Environment variables**. Names only here. Keep the values secret.

| Name | Secret? | What it is |
|---|---|---|
| `DATABASE_URL` | Secret | Neon main branch, **pooled** connection string (the host contains `-pooler`) |
| `SESSION_SECRET` | Secret | Base64 of 32 random bytes. Make it with the command below. It also keys the IP hash for rate limits |
| `SITE_ORIGIN` | Not secret | The exact production origin: `https://www.yznmoh.com`. No trailing slash |

These three are all. The admin username and password are not env variables: they are stored in the
database (see **Admin account** below). If an old `ADMIN_PASSWORD_HASH` is still set in Netlify, delete it.

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

## Admin account

The admin login (username and password) lives in the `admin_account` table. Create it once, from your
own computer, after the migration:

1. In the local `.env`, set `DATABASE_URL` to the Neon **main** branch URL (the same one Netlify uses).
   The command reads `.env`, and `.env` wins over a `DATABASE_URL` set in your shell.
2. In PowerShell, from the repo folder, run:

   ```powershell
   .\node_modules\.bin\tsx.cmd server\bin\admin-account.ts
   ```

   (`pnpm admin:create` does the same if pnpm is on your PATH.)
3. Type a username (3 to 64 characters), then the password twice (at least 12 characters; nothing
   shows while you type). It prints `Admin account saved.`
4. Log in at `https://www.yznmoh.com/admin` with that username (case does not matter) and password.

You can change the username or password later on the admin **Account** page. Saving there logs out
every other browser.

**Forgot the password?** Run the same command again. It replaces the account and logs out every session.

Until an account exists, every login answers "Wrong username or password." and the function log says
`No admin account. Run admin:create.`

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
| Login always says "Wrong username or password." | No admin account yet, or a typo. Run the admin account command again (see **Admin account**) |
| Admin save or contact form returns 403 | You are on a `*.netlify.app` URL, or `SITE_ORIGIN` is not exact |
| `/api/...` returns HTML | Check the `/api/*` redirect is before `/*` in `netlify.toml` |
| Page 404 on refresh | Check the `/* → /index.html` redirect is last |
