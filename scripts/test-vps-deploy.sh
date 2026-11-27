#!/bin/sh
# Linux-only fixture test; pass an existing scratch parent and the deploy.sh under test.
# pnpm/node/id are controlled fixture commands, never production tools or accounts.
set -eu
scratch=$1
deploy=$2
root=$(mktemp -d "$scratch/portfolio-deploy-fixture-XXXXXX")
trap 'rm -rf "$root"' EXIT
mkdir -p "$root/bin" "$root/source"
printf '#!/bin/sh\nprintf "hosting\\n"\n' > "$root/bin/id"
printf '#!/bin/sh\nset -eu\ntest -f dist/index.html\ntest -f dist-server/server.mjs\ntest ! -e .env\nif [ "${FAIL_SMOKE:-0}" = 1 ]; then exit 1; fi\n' > "$root/bin/node"
printf '#!/bin/sh\nset -eu\nif [ "$1" = install ]; then exit 0; fi\nmkdir -p dist/assets dist-server\ncp marker dist/index.html\nprintf fixture > "dist/assets/$(cat marker).js"\nprintf fixture > dist-server/server.mjs\nif [ "${FAIL_BUILD:-0}" = 1 ]; then exit 1; fi\n' > "$root/bin/pnpm"
chmod +x "$root/bin/"*
export PATH="$root/bin:$PATH"
(
  cd "$root/source"
  git init -q -b main
  git config user.email fixture@example.invalid
  git config user.name Fixture
  printf 'releases/\ncurrent\nprevious\n.deploy-lock/\n.current-*\n.previous-*\n' > .gitignore
  printf old > marker
  git add marker .gitignore; git commit -qm old
)
git clone -q --bare "$root/source" "$root/origin.git"
git clone -q "$root/origin.git" "$root/live"
printf 'PRIVATE_FIXTURE_ONLY' > "$root/live/.env"
export PORTFOLIO_DEPLOY_ROOT="$root/live"
sh "$deploy"
first=$(readlink "$root/live/current")
test "$(cat "$root/live/current/dist/index.html")" = old
test ! -e "$root/live/current/.env"
(
  cd "$root/source"
  printf new > marker
  git add marker; git commit -qm new
  git push -q "$root/origin.git" main
)
if FAIL_BUILD=1 sh "$deploy"; then printf 'expected build failure\n' >&2; exit 1; fi
test "$(readlink "$root/live/current")" = "$first"
test "$(cat "$root/live/current/dist/index.html")" = old
test ! -e "$root/live/.deploy-lock"
if FAIL_SMOKE=1 sh "$deploy"; then printf 'expected smoke failure\n' >&2; exit 1; fi
test "$(readlink "$root/live/current")" = "$first"
sh "$deploy"
second=$(readlink "$root/live/current")
test "$second" != "$first"
test "$(readlink "$root/live/previous")" = "$first"
test "$(cat "$root/live/current/dist/index.html")" = new
test "$(cat "$root/live/$first/dist/index.html")" = old
test -f "$root/live/current/dist/assets/old.js"
test -f "$root/live/current/dist/assets/new.js"
# Repeat the identical SHA; it must not destroy the rollback target.
sh "$deploy"
test "$(readlink "$root/live/previous")" = "$first"
ln -s "$(readlink "$root/live/previous")" "$root/live/.rollback-test"
mv -Tf "$root/live/.rollback-test" "$root/live/current"
test "$(cat "$root/live/current/dist/index.html")" = old
test "$(cat "$root/live/.env")" = PRIVATE_FIXTURE_ONLY
printf '%s\n' 'Atomic deploy fixture: initial activation, failed build, failed smoke, successful switch, retained old chunks, same-SHA idempotency, rollback OK'
