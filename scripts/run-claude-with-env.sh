#!/usr/bin/env bash
# Load project .env into the environment, then start Claude Code.
# Usage (from repo / any directory):
#   ./scripts/run-claude-with-env.sh
#   ./scripts/run-claude-with-env.sh --project /path/to/your/app
#
# Requires: a .env file next to .mcp.json (typically project root).

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "Missing .env in $ROOT" >&2
  echo "Copy .env.example to .env and fill in your backend URLs and tokens." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

exec claude "$@"
