#!/usr/bin/env bash
# Clone, build and start NextChat on this machine without Docker.
# Requires Node.js 18+ and yarn (corepack enable). Reads keys from ./.env.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$HERE/NextChat"
[ -f "$HERE/.env" ] || { echo "Copy .env.example to .env and add an API key first."; exit 1; }
if [ ! -d "$SRC" ]; then
  git clone --depth 1 https://github.com/ChatGPTNextWeb/NextChat.git "$SRC"
fi
cd "$SRC"
cp "$HERE/.env" .env.local
yarn install --frozen-lockfile --ignore-scripts
yarn build
echo
echo "Starting NextChat on http://localhost:3000"
echo "On your phone (same Wi-Fi) open http://$(hostname -I 2>/dev/null | awk '{print $1}'):3000"
exec yarn start
