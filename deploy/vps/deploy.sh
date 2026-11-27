#!/bin/sh
set -eu
umask 077
if [ "$(id -un)" != "hosting" ]; then
  printf '%s\n' 'Run this script as hosting (not root).' >&2
  exit 1
fi
# Override only for an isolated deployment fixture / an alternative hosting home.
cd "${PORTFOLIO_DEPLOY_ROOT:-/home/hosting/portfolio}"
root=$(pwd -P)
mkdir -p "$root/releases"
if ! mkdir "$root/.deploy-lock" 2>/dev/null; then
  printf '%s\n' 'Another deployment is in progress (.deploy-lock exists).' >&2
  exit 1
fi
stage=
pending=
cleanup() {
  [ -z "$stage" ] || rm -rf -- "$stage"
  [ -z "$pending" ] || rm -f -- "$pending"
  rmdir "$root/.deploy-lock"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM
if [ -e "$root/current" ] && [ ! -L "$root/current" ]; then
  printf '%s\n' 'current must be a symlink, not a directory.' >&2
  exit 1
fi
git diff --exit-code --quiet
git diff --cached --exit-code --quiet
git pull --ff-only
sha=$(git rev-parse HEAD)
release="$root/releases/$sha"
if [ ! -d "$release" ]; then
  stage=$(mktemp -d "$root/releases/.build-$sha-XXXXXX")
  # No .env or local state enters a build. The live release is never a build directory.
  git archive --format=tar --output="$stage/source.tar" HEAD
  tar -xf "$stage/source.tar" -C "$stage"
  rm "$stage/source.tar"
  (
    cd "$stage"
    pnpm install --frozen-lockfile
    pnpm build:vps
    node scripts/smoke-vps.mjs
  )
  # Keep old hashed chunks available to open browser tabs after the service restarts.
  assets="$root/current/dist/assets"
  [ -d "$assets" ] || assets="$root/dist/assets"
  if [ -d "$assets" ]; then
    mkdir -p "$stage/dist/assets"
    cp -Rn "$assets/." "$stage/dist/assets/"
  fi
  mv "$stage" "$release"
  stage=
else
  (cd "$release" && node scripts/smoke-vps.mjs)
fi
old=
if [ -L "$root/current" ]; then old=$(readlink "$root/current"); fi
if [ "$old" != "releases/$sha" ]; then
  if [ -n "$old" ]; then
    pending="$root/.previous-$$"
    ln -s "$old" "$pending"
    mv -Tf "$pending" "$root/previous"
    pending=
  fi
  pending="$root/.current-$$"
  ln -s "releases/$sha" "$pending"
  # GNU mv -T performs an atomic rename of the symlink, never follows current.
  mv -Tf "$pending" "$root/current"
  pending=
fi
printf 'Activated release: %s\n' "$sha"
printf '%s\n' 'restart with: sudo systemctl restart portfolio'
