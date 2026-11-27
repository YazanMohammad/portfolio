# Deploy to a Linux VPS

The same checkout still deploys to Netlify normally. `pnpm build:vps` builds the Vite SPA in `dist/` and bundles all existing Netlify handlers and their server dependencies into `dist-server/server.mjs`. The running app needs Node and these two output directories, not Netlify CLI. Run it behind Caddy, never directly on a public interface.

## 1. Prepare the host

Install Git, Node **22 or newer**, pnpm **10.34.9**, and a current Caddy with the `request_body` directive (2.10+). Ensure `/usr/bin/node` is the installed Node executable. Permit inbound TCP 80/443 and SSH; do not expose 3000. Create the unprivileged `hosting` account with home `/home/hosting`.

As root:

```sh
install -d -o hosting -g hosting -m 0700 /home/hosting/data /home/hosting/data/files
```

As `hosting`, clone your repository to `/home/hosting/portfolio`, then:

```sh
cd /home/hosting/portfolio
pnpm install --frozen-lockfile
cp .env.example .env
chmod 600 .env
```

Keep pnpm's `minimumReleaseAge` policy enabled; do not bypass it to resolve an install failure. The build requires devDependencies (including esbuild).

## 2. Configure `.env`

Set the following on the VPS. Use the intended database branch; never copy a developer's inherited database URL blindly.

```dotenv
DATABASE_URL=postgresql://...pooled-Neon-endpoint...
DATABASE_URL_UNPOOLED=postgresql://...direct-Neon-endpoint...
SESSION_SECRET=...
SITE_ORIGIN=https://185-189-1-11.sslip.io
FILES_DIR=/home/hosting/data/files
TRUST_PROXY=1
HOST=127.0.0.1
PORT=3000
```

- `DATABASE_URL`: runtime connection string; `DATABASE_URL_UNPOOLED`: the **same branch**, direct connection used only by migrations.
- `SESSION_SECRET`: base64 of at least 32 random bytes. Generate once with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Keep it private and stable across restarts.
- `SITE_ORIGIN`: exact external HTTPS origin, no trailing slash. Writes from other origins are rejected. HTTP is allowed only for loopback development, such as `http://localhost:8890`.
- `FILES_DIR`: absolute persistent path outside the checkout. New directories are 0700 and files 0600; writes use a temporary file and atomic rename. Content type is derived from the validated extension. Back up this directory **and** the database together. With this unset/empty, Netlify Blobs works exactly as before; existing Blobs are not automatically copied to disk. Migrating existing content requires copying the files under their original keys or uploading replacements in the admin.
- `TRUST_PROXY=1`: trusts forwarded protocol and the **right-most** X-Forwarded-For IP only when the socket peer is loopback. Do not put an untrusted local proxy in front of the app. Caddy appends the direct client's IP and protects this boundary.
- `HOST`/`PORT`: loopback address and backend port; changing PORT also requires changing the Caddyfile.

`BLOBS_SITE_ID` and `BLOBS_TOKEN` are not needed with FILES_DIR. `CV_PATH` is optional: point it at a readable PDF before seeding if you want an initial CV. `DATABASE_URL_TEST` and its unpooled counterpart are for isolated tests only, not runtime.

The standalone process uses its environment (systemd loads `.env`). It does not read `.env` itself. For a manual start, use `node --env-file=.env dist-server/server.mjs` after building. CLI migration/admin/seed tools read the checkout's `.env` themselves, and its values override inherited variables.

## 3. Initialize once, deliberately

As `hosting`, confirm both database URLs target the intended branch before executing:

```sh
cd /home/hosting/portfolio
pnpm db:migrate
pnpm admin:create
pnpm db:seed
pnpm build:vps
```

`admin:create` displays the target database, asks for confirmation, then username and password. It replaces the singleton account and ends existing admin sessions. Do not run it as part of an ordinary deploy. `db:seed` skips an already-populated database; **do not use `--force`** unless deliberately replacing site content. With FILES_DIR set, seed images and the optional CV are written there without Netlify credentials. The initial database must be migrated before either command.

Do not run DB tests against this production branch. The only supported DB-suite command is `pnpm test:db`, configured with the isolated TEST branch.

## 4. Install systemd and Caddy

As root:

```sh
cp /home/hosting/portfolio/deploy/vps/portfolio.service /etc/systemd/system/portfolio.service
systemctl daemon-reload
systemctl enable --now portfolio
journalctl -u portfolio -n 30 --no-pager
cp /home/hosting/portfolio/deploy/vps/Caddyfile /etc/caddy/Caddyfile
systemctl edit caddy
```

In Caddy's override, set:

```ini
[Service]
Environment=SITE_HOST=185-189-1-11.sslip.io
```

For the temporary IP-based host, comment out the `yznmoh.com` apex block until you control its DNS on this VPS. The site placeholder is expanded from the **Caddy process environment**, not the portfolio `.env`.

```sh
systemctl daemon-reload
SITE_HOST=185-189-1-11.sslip.io caddy validate --config /etc/caddy/Caddyfile
systemctl restart caddy
```

Caddy terminates HTTPS, compresses responses, and forwards to 127.0.0.1:3000. Its request-body limit is 4 MiB + 64 KiB multipart overhead (4,259,840 bytes), matching the app's maximum; JSON routes enforce their smaller existing caps. The app times requests out after 30 seconds, emits a method/path/status/duration line without queries or cookies, and drains requests on SIGTERM (systemd allows 40 seconds). A timeout cancels the request signal; it cannot roll back a database statement already submitted.

The service can read `/home/hosting/portfolio` and `.env` under `ProtectHome=read-only`; only `/home/hosting/data` is writable under `ProtectSystem=strict`. `NoNewPrivileges`, `PrivateTmp`, and a private umask are enabled. Do not use `ProtectHome=true`, which would hide the checkout. Keep ownership of `.env`, checkout, and data with `hosting`.

## 5. Verify and update

```sh
curl -I https://185-189-1-11.sslip.io/
curl -i https://185-189-1-11.sslip.io/api/content
curl -i https://185-189-1-11.sslip.io/api/nope
curl -i https://185-189-1-11.sslip.io/cv
curl --path-as-is -i https://185-189-1-11.sslip.io/%2e%2e/.env
```

Expect HTML with CSP on `/`, JSON content on `/api/content`, JSON 404 for the unknown API, and 404 for traversal. `/cv` redirects to the stored PDF when configured (otherwise JSON 404). Log in at `/admin`, upload an image, save it, and read it back. Files carry a restrictive CSP; hashed SPA assets have immutable one-year cache headers, while index.html is no-cache.

For subsequent deploys, run **as hosting**:

```sh
sh /home/hosting/portfolio/deploy/vps/deploy.sh
sudo systemctl restart portfolio
```

The script pulls fast-forward only, installs the lockfile, builds, and prints the restart command. It **never migrates, seeds, or restarts** automatically. Handle intentional migrations separately after a backup. Keep `dist/` and `dist-server/` together when rolling back.

Security headers live in `shared/security-headers.json`. To change them, run `node scripts/sync-security-headers.mjs` and commit the generated `netlify.toml`; both ordinary and VPS builds reject drift. Function imports are generated by `scripts/generate-vps-functions.mjs`, and tests check every function is registered, including the API fallback. Keep function `config.path` values literal for Netlify's extractor.

Optional browser smoke against an already-running isolated test instance:

```sh
PLAYWRIGHT_BASE_URL=http://localhost:8890 E2E_ADMIN_USERNAME=... E2E_ADMIN_PASSWORD=... pnpm e2e
```

## Switch to `https://www.yznmoh.com`

1. Back up the database, persistent files, and private `.env`. Point both `www.yznmoh.com` and `yznmoh.com` A records to `185.189.1.11` (remove stale AAAA records unless IPv6 is configured).
2. Change the portfolio `.env` from `SITE_ORIGIN=https://185-189-1-11.sslip.io` to `SITE_ORIGIN=https://www.yznmoh.com` and restart `portfolio`.
3. Change Caddy's systemd override to `Environment=SITE_HOST=www.yznmoh.com`; enable the apex 301 block in `/etc/caddy/Caddyfile`. Validate with `SITE_HOST=www.yznmoh.com caddy validate --config /etc/caddy/Caddyfile`, daemon-reload, and restart Caddy. Allow HTTPS certificate issuance to complete.
4. Check the canonical site and `curl -I https://yznmoh.com/` (301 to www). Log in again on www; the temporary host's cookies do not transfer. Writes from the old test host now return 403 by design.

Netlify deployment remains `pnpm build` with the existing functions, redirects, and Blobs default. No VPS-only environment variables are required there.
