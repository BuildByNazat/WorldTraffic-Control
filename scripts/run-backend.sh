#!/usr/bin/env bash
# ============================================================
#  WorldTraffic Control — Run Backend (macOS / Linux)
#  Run from the project root:  bash scripts/run-backend.sh
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$PROJECT_DIR/backend"
VENV_DIR="$BACKEND_DIR/.venv"
UVICORN="$VENV_DIR/bin/uvicorn"

if [ ! -f "$UVICORN" ]; then
    echo "✖ Virtual environment not found at backend/.venv"
    echo "  Run setup first:  bash scripts/setup.sh"
    exit 1
fi

echo "→ Starting FastAPI backend ..."
echo "  URL: http://localhost:8000"
echo "  API docs: http://localhost:8000/docs"
echo "  Press Ctrl+C to stop."
echo ""

cd "$BACKEND_DIR"
"$UVICORN" app.main:app --reload --host 0.0.0.0 --port 8000
