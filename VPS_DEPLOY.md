# Deploy to a Linux VPS

The same checkout still deploys to Netlify normally. `pnpm build:vps` builds the Vite SPA in `dist/` and bundles all existing Netlify handlers and their server dependencies into `dist-server/server.mjs`. The running app needs Node and these two output directories, not Netlify CLI. Run it behind Caddy, never directly on a public interface.

## 1. Prepare the host

Install Git, Node **22 or newer**, pnpm **10.34.9**, and a current Caddy with the `request_body` directive (2.10+). Ensure `/usr/bin/node` is the installed Node executable. Permit inbound TCP 80/443 and SSH; do not expose 3000. Create the unprivileged `hosting` account with home `/home/hosting`.

As root:

```sh
install -d -o hosting -g hosting -m 0700 /home/hosting/data /home/hosting/data/portfolio /home/hosting/data/portfolio/files
```

As `hosting`, clone your repository to `/home/hosting/portfolio`, then:

```sh
cd /home/hosting/portfolio
pnpm install --frozen-lockfile
cp .env.example .env
chmod 600 .env
```

Do not put `export` prefixes or inline comments after values in `.env`: systemd EnvironmentFile and dotenv do not parse those identically. Put comments on their own lines. Keep values single-line and quote only as needed by both parsers.

Keep pnpm's `minimumReleaseAge` policy enabled; do not bypass it to resolve an install failure. The build requires devDependencies (including esbuild).

## 2. Configure `.env`

Set the following on the VPS. Use the intended database branch; never copy a developer's inherited database URL blindly.

```dotenv
DATABASE_URL=postgresql://...pooled-Neon-endpoint...
DATABASE_URL_UNPOOLED=postgresql://...direct-Neon-endpoint...
SESSION_SECRET=...
SITE_ORIGIN=https://www.yznmoh.com
FILES_DIR=/home/hosting/data/portfolio/files
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

The standalone process uses its environment (systemd loads the checkout's `.env`). It does not read `.env` itself. Releases never contain `.env`. For a manual start from the checkout after release activation, use `node --env-file=.env current/dist-server/server.mjs`. CLI migration/admin/seed tools read the checkout's `.env` themselves, and its values override inherited variables.

## 3. Initialize once, deliberately

As `hosting`, confirm both database URLs target the intended branch before executing:

```sh
cd /home/hosting/portfolio
pnpm db:migrate
pnpm admin:create
pnpm db:seed
sh deploy/vps/deploy.sh
```

`admin:create` displays the target database, asks for confirmation, then username and password. It replaces the singleton account and ends existing admin sessions. Do not run it as part of an ordinary deploy. `db:seed` skips an already-populated database; **do not use `--force`** unless deliberately replacing site content. With FILES_DIR set, seed images and the optional CV are written there without Netlify credentials. The initial database must be migrated before either command.

Do not run DB tests against this production branch. The only supported DB-suite command is `pnpm test:db`, configured with the isolated TEST branch.

## 4. Install systemd and Caddy

The VPS already uses `SITE_ORIGIN=https://www.yznmoh.com`. Keep that canonical origin; the old sslip.io test host now redirects to www. This server hosts multiple apps: install only the portfolio snippet, never replace another app's routes.

As root, after the first release has been activated:

```sh
cp /home/hosting/portfolio/deploy/vps/portfolio.service /etc/systemd/system/portfolio.service
systemctl daemon-reload
systemctl enable --now portfolio
journalctl -u portfolio -n 30 --no-pager
install -d -m 0755 /etc/caddy/sites
cp /home/hosting/portfolio/deploy/vps/portfolio.caddy /etc/caddy/sites/portfolio.caddy
```

The shared `/etc/caddy/Caddyfile` should contain only the server's own site plus app imports (an example is `deploy/vps/Caddyfile`):

```caddyfile
import /etc/caddy/sites/*.caddy

vps.yznmoh.com {
    respond "VPS host" 200
}
```

If an existing main file contains the portfolio blocks, **move** them into the snippet instead of leaving duplicates. Preserve all other app snippets. No SITE_HOST environment override is needed: the app domains are explicit in the snippet.

```sh
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
```

The portfolio snippet serves www with HSTS and redirects both `yznmoh.com` and `185-189-1-11.sslip.io` to `https://www.yznmoh.com{uri}` using 301. These canonical-domain redirect blocks are intentionally enabled for the already-configured production domain, not a speculative pre-DNS apex block.

Caddy terminates HTTPS, compresses responses, and forwards to 127.0.0.1:3000. Its request-body limit is 4 MiB + 64 KiB multipart overhead (4,259,840 bytes), matching the app's maximum; JSON routes enforce their smaller existing caps. The adapter streams bodies only when a handler reads, so origin/session rejection happens before an upload is consumed. It enforces route caps while streaming, a process-wide **16 MiB consumed-body budget**, **64 active handlers**, and **128 accepted connections**; overload returns JSON 503 with Retry-After. Consumed bytes and handler slots remain reserved until the handler settles, even after a timeout, so a pending DB request cannot evade the limits. Node socket buffering is also bounded by the connection cap (16 KiB high-water marks). A handler may make bounded extra copies while parsing; the budget is not a promise of total heap size.

Headers have an absolute 10-second deadline (also on idle keep-alive reuse); the full request/handler has a 30-second deadline. Timeout/rejection closes incomplete uploads instead of draining them; Node's timeout sweep runs every 250 ms rather than the default 30 seconds. The app emits a method/path/status/duration line without queries or cookies and drains requests on SIGTERM (systemd allows 40 seconds), then exits explicitly after closing listeners. A timeout cancels the request signal; it cannot roll back a database statement already submitted.

The service can read `/home/hosting/portfolio` and `.env` under `ProtectHome=read-only`; only `/home/hosting/data/portfolio` is writable under `ProtectSystem=strict`. `NoNewPrivileges`, `PrivateTmp`, private devices, kernel/control-group protections, an empty capability set, restricted address families/namespaces, personality locking, and a private umask are enabled. `SystemCallFilter` and `MemoryDenyWriteExecute` are deliberately not enabled without platform-specific V8 validation. Do not use `ProtectHome=true`, which would hide the checkout. Keep ownership of `.env`, checkout, and data with `hosting`. FILES_DIR is initialized and chmod-checked at startup (fail-fast), not on each read; only stale private temp files older than 24 hours are swept. Linux writes fsync the file and containing directory. HSTS (`max-age=31536000`, without includeSubDomains/preload) lives in Caddy, not the shared app headers, and the proxy hides its Server header.

## 5. Verify and update

```sh
curl -I https://www.yznmoh.com/
curl -i https://www.yznmoh.com/api/content
curl -i https://www.yznmoh.com/api/nope
curl -i https://www.yznmoh.com/cv
curl --path-as-is -i https://www.yznmoh.com/%2e%2e/.env
```

Expect HTML with CSP on `/`, JSON content on `/api/content`, JSON 404 for the unknown API, and 404 for traversal. `/cv` redirects to the stored PDF when configured (otherwise JSON 404). Log in at `/admin`, upload an image, save it, and read it back. Files carry a restrictive CSP; hashed SPA assets have immutable one-year cache headers, while index.html is no-cache.

For subsequent deploys, run **as hosting**:

```sh
sh /home/hosting/portfolio/deploy/vps/deploy.sh
sudo systemctl restart portfolio
```

The script pulls the checkout's selected branch fast-forward only (including an existing `vps-test` branch), archives the exact commit into a fresh `releases/.build-<sha>-...` directory, installs/builds there, and runs a release-local HTTP smoke with **no database or .env loaded**. A failed install/build/smoke removes staging and leaves `current` and the running release untouched. Successful builds become `releases/<sha>`, then `current` is switched by an atomic symlink rename. The prior target is kept in `previous`, and old hashed assets are copied without overwriting new assets so open tabs survive the restart. A deploy lock prevents overlapping activations. An identical SHA reuses the already-built release after another smoke.

Layout (all under `/home/hosting/portfolio`):

```text
.env                        # persistent, private; never archived into releases
releases/<sha>/dist/         # release-local SPA
releases/<sha>/dist-server/  # matching server bundle
current -> releases/<sha>
previous -> releases/<previous-sha>
```

The process already running is pinned to its physical release, so switching `current` does not change its files or API mid-request. Only the explicit restart starts the new matched bundle/SPA. The script **never migrates, seeds, or restarts** automatically. Handle intentional migrations separately after a backup. Releases are not garbage-collected automatically: keep current/previous and prune older releases only deliberately (never remove files used by a still-running process). Retained hashed assets also consume disk space.

### Upgrade an existing in-place VPS installation

Do not stop the existing service just to build. As hosting, pull this change and run `sh deploy/vps/deploy.sh` to create the first release while the old service continues reading the old checkout `dist/`.

Before installing the updated unit, create `/home/hosting/data/portfolio/files` with the ownership/modes above and make sure `.env` has `FILES_DIR=/home/hosting/data/portfolio/files`. If files still live in the older shared `/home/hosting/data/files`, briefly stop the service, copy that directory's contents (preserving filenames/permissions) into the per-app directory as hosting, and update FILES_DIR. Keep the old files as a backup until verified; do not seed or regenerate keys to move storage.

Then, as root, copy the **updated** `portfolio.service`, run `systemctl daemon-reload`, and restart `portfolio`. Its WorkingDirectory and ExecStart now use `current`, but EnvironmentFile still uses the checkout `.env`. Keep the old checkout `dist/` and bundle until this first transition is verified; they are the initial rollback fallback when `previous` does not exist yet. The supplied scripts do not contact or modify any remote VPS themselves.

### Roll back

As hosting, use GNU `mv -T` to atomically select the previous release; first inspect both targets:

```sh
cd /home/hosting/portfolio
readlink current
readlink previous
# Do not run concurrently with deploy.sh. A missing previous means no prior release is recorded.
(
  set -eu
  mkdir .deploy-lock
  trap 'rm -f .rollback-current; rmdir .deploy-lock' EXIT
  rollback=$(readlink previous)
  test -d "$rollback/dist-server"
  ln -s "$rollback" .rollback-current
  mv -Tf .rollback-current current
)
sudo systemctl restart portfolio
```

To return to another retained version, use its `releases/<full-sha>` target the same way. A schema change may require a forward fix rather than code rollback; the script never reverses database migrations. Before the first release-layout transition, record the original service unit so it can be restored if needed.

Security headers live in `shared/security-headers.json`. To change them, run `node scripts/sync-security-headers.mjs` and commit the generated `netlify.toml`; both ordinary and VPS builds reject drift. Function imports are regenerated manually with `node scripts/generate-vps-functions.mjs`; VPS builds check the committed registry without modifying it, and tests check every function is registered, including the API fallback. Keep function `config.path` values literal for Netlify's extractor.

Optional browser smoke against an already-running isolated test instance:

```sh
PLAYWRIGHT_BASE_URL=http://localhost:8890 E2E_ADMIN_USERNAME=... E2E_ADMIN_PASSWORD=... pnpm e2e
```

### Intentional strict route differences

The standalone adapter returns JSON 404 for `/api`, unknown API routes, trailing-slash API/CV paths, missing file-like paths (for example `/missing.png`), and HEAD requests to functions whose literal config allows only GET. Static files and SPA routes support HEAD. These choices fail closed rather than assuming undocumented Netlify trailing-slash/HEAD rewrites; non-file GET/HEAD navigation still falls back to index.html. Percent-encoded ordinary path segments are canonicalized once for both caps and dispatch; raw fragments and unsafe paths are rejected.

## DNS and additional apps

At Namecheap configure:

- **A** record `vps` → `185.189.1.11` (the server's stable name is `vps.yznmoh.com`).
- **CNAME** record `www` → `vps.yznmoh.com` for this portfolio app; use a CNAME to the same server name for each additional app domain/subdomain.
- **ALIAS** at the apex (`@`, `yznmoh.com`) → `vps.yznmoh.com` on Namecheap, rather than an apex CNAME.
- Remove stale AAAA records unless IPv6 is intentionally configured. Let DNS resolve to this VPS before asking Caddy for certificates.

The canonical portfolio origin is already `https://www.yznmoh.com`; no switch back to sslip.io is needed. When moving from an old test configuration, set SITE_ORIGIN to the canonical www origin, restart the portfolio service, install the canonical snippet, validate the complete shared Caddyfile, and reload Caddy. Check `curl -I https://yznmoh.com/` and `curl -I https://185-189-1-11.sslip.io/` (301 to www). Log in on www; test-host cookies do not transfer and writes from the old test host return 403 by design.

Adding another app means a new checkout/release folder under `/home/hosting/<app>`, its own systemd service and loopback port, its own `/home/hosting/data/<app>` directory and FILES_DIR, and a new `/etc/caddy/sites/<app>.caddy` snippet. Adjust that service's WorkingDirectory, EnvironmentFile, ExecStart, and ReadWritePaths to its own paths. Use a CNAME to `vps.yznmoh.com` for its domain (apex ALIAS when needed). Validate the shared config before reloading; do not overwrite the portfolio snippet or main host block.

Netlify deployment remains `pnpm build` with the existing functions, redirects, and Blobs default. No VPS-only environment variables are required there.
