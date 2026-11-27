#!/bin/sh
set -eu
if [ "$(id -un)" != "hosting" ]; then
  printf '%s\n' 'Run this script as hosting (not root).' >&2
  exit 1
fi
cd /home/hosting/portfolio
git pull --ff-only
pnpm install --frozen-lockfile
pnpm build:vps
printf '%s\n' 'restart with: sudo systemctl restart portfolio'
