#!/usr/bin/env bash
# ============================================================
#  WorldTraffic Control — One-time Setup (macOS / Linux)
#  Run from the project root:  bash scripts/setup.sh
# ============================================================

set -e

# ── Locate project root ───────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
VENV_DIR="$BACKEND_DIR/.venv"

echo ""
echo "========================================"
echo "  WorldTraffic Control — Project Setup  "
echo "========================================"
echo "Project root : $PROJECT_DIR"
echo "Backend      : $BACKEND_DIR"
echo "Virtual env  : $VENV_DIR"
echo ""

# ── Check Python ─────────────────────────────────────────────────────────────
if command -v python3 &>/dev/null; then
    PY_VERSION=$(python3 --version)
    echo "✔ Python found: $PY_VERSION"
    PY_CMD="python3"
elif command -v python &>/dev/null; then
    PY_VERSION=$(python --version)
    echo "✔ Python found: $PY_VERSION"
    PY_CMD="python"
else
    echo "✖ Python not found. Install Python 3.10+ from https://python.org"
    exit 1
fi

# ── Create virtual environment ───────────────────────────────────────────────
if [ -d "$VENV_DIR" ]; then
    echo "✔ Virtual environment already exists at backend/.venv"
else
    echo "→ Creating Python virtual environment at backend/.venv ..."
    $PY_CMD -m venv "$VENV_DIR"
    echo "✔ Virtual environment created."
fi

# ── Install backend dependencies ─────────────────────────────────────────────
echo ""
echo "→ Installing backend Python packages ..."
"$VENV_DIR/bin/pip" install --upgrade pip --quiet
"$VENV_DIR/bin/pip" install -r "$BACKEND_DIR/requirements.txt"
echo "✔ Backend packages installed."

# ── Check Node / npm ─────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
    echo "✖ Node.js not found. Install Node 18+ from https://nodejs.org"
    exit 1
fi
NODE_VERSION=$(node --version)
echo "✔ Node.js found: $NODE_VERSION"

# ── Install frontend npm packages ─────────────────────────────────────────────
echo ""
echo "→ Installing frontend npm packages ..."
cd "$FRONTEND_DIR"
npm install
echo "✔ Frontend packages installed."

# ── Create .env if missing ────────────────────────────────────────────────────
if [ ! -f "$BACKEND_DIR/.env" ] && [ -f "$PROJECT_DIR/.env.example" ]; then
    cp "$PROJECT_DIR/.env.example" "$BACKEND_DIR/.env"
    echo "✔ Created backend/.env from .env.example"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "========================================"
echo "  Setup complete!"
echo "========================================"
echo ""
echo "To start the project:"
echo "  Backend  →  bash scripts/run-backend.sh"
echo "  Frontend →  bash scripts/run-frontend.sh"
echo "  (In separate terminals)"
echo ""
