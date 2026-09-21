#!/bin/bash
# Double-click this file in Finder to start the dashboard.
#
# macOS opens .command files in Terminal. This script starts the local server and
# your browser, and keeps running until you close the window or press Ctrl-C.

cd "$(dirname "$0")" || exit 1

printf '\nProfessional Impact Portfolio\n\n'

if ! command -v node >/dev/null 2>&1; then
  cat <<'MSG'
Node.js is not installed, and this tool needs it (version 18.17 or newer).

  Install it either way:
    - Download the "LTS" installer from https://nodejs.org  (simplest), or
    - If you use Homebrew:  brew install node

Then double-click this file again.

MSG
  read -r -p "Press Return to close." _
  exit 1
fi

MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$MAJOR" -lt 18 ]; then
  printf 'Node %s is installed, but this tool needs 18.17 or newer.\n' "$(node -v)"
  printf 'Update from https://nodejs.org and try again.\n\n'
  read -r -p "Press Return to close." _
  exit 1
fi

# Find a free port, starting at the default.
PORT=4178
while lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; do
  PORT=$((PORT + 1))
done

if [ ! -f data/portfolio.json ]; then
  printf 'No dataset found yet.\n'
  printf 'The dashboard will open with an empty state and a demo you can explore.\n'
  printf 'To load your history:  node bin/portfolio.mjs restore <your-backup.json>\n\n'
fi

printf 'Starting on port %s. Close this window or press Ctrl-C to stop.\n' "$PORT"
node bin/portfolio.mjs serve --port "$PORT"
