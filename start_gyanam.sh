#!/bin/bash
# GYANAM AI — NLU JODHPUR EDITION (Powered by Kelyvo)
# Paths derive from this script's location. Secrets come from the environment:
#   GEMINI_API_KEY (optional), GYANAM_JWT_SECRET (recommended)
# Optional: GYANAM_DB_PATH, GYANAM_UPLOAD_DIR, GYANAM_DOCS_DIR, GYANAM_UI=new|legacy
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -x "$PROJECT_DIR/venv/bin/python" ]; then PYTHON_BIN="$PROJECT_DIR/venv/bin/python"; else PYTHON_BIN="${PYTHON_BIN:-python3}"; fi

echo "=========================================================="
echo "STARTING GYANAM AI — NLU JODHPUR EDITION (Powered by Kelyvo)"
echo "   Database: ${GYANAM_DB_PATH:-$PROJECT_DIR/data/vidhi_legal.db}"
echo "=========================================================="

cd "$PROJECT_DIR"
export PORT="${PORT:-8090}"
export PYTHONPATH="$PROJECT_DIR/backend:$PYTHONPATH"
[ -z "$GYANAM_JWT_SECRET$VIDHI_JWT_SECRET" ] && echo "WARNING: GYANAM_JWT_SECRET not set; a random per-process secret will be used (tokens reset on restart)."
echo "Launching Gyanam AI on http://localhost:$PORT"
exec "$PYTHON_BIN" "$PROJECT_DIR/backend/server.py"
