#!/usr/bin/env bash
# ============================================================
#  WorldTraffic Control — Run Frontend (macOS / Linux)
#  Run from the project root:  bash scripts/run-frontend.sh
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
FRONTEND_DIR="$PROJECT_DIR/frontend"

if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
    echo "✖ node_modules not found in frontend/"
    echo "  Run setup first:  bash scripts/setup.sh"
    exit 1
fi

echo "→ Starting frontend dev server ..."
echo "  URL: http://localhost:5173"
echo "  Press Ctrl+C to stop."
echo ""

cd "$FRONTEND_DIR"
npm run dev
