#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 18 or newer is required." >&2
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required." >&2
  exit 1
fi

node_major="$(node -p "Number(process.versions.node.split('.')[0])")"
if [ "$node_major" -lt 18 ]; then
  echo "Node.js 18 or newer is required. Detected: $(node --version)" >&2
  exit 1
fi

npm install
npm run verify
npm test
echo "Setup complete. Run ./start-macos-linux.sh"
