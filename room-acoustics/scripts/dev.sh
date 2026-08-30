#!/usr/bin/env bash
# Start the API (uvicorn :8765) and the UI (vite :5173) together; Ctrl-C stops both.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
(cd "$ROOT/sim" && uv run uvicorn soundroom.api:app --port 8765 --reload) &
API=$!
trap 'kill $API 2>/dev/null' EXIT
(cd "$ROOT/ui" && npm run dev)
