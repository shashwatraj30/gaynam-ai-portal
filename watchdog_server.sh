#!/bin/bash
# Auto-restart watchdog for Gyanam AI Server
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -x "$PROJECT_DIR/venv/bin/python" ]; then PYTHON_BIN="$PROJECT_DIR/venv/bin/python"; else PYTHON_BIN="${PYTHON_BIN:-python3}"; fi
PORT="${PORT:-8090}"
while true; do
  if ! curl -s -m 3 "http://localhost:$PORT/api/status" > /dev/null 2>&1; then
    echo "[$(date)] Port $PORT offline. Relaunching server..."
    "$PYTHON_BIN" "$PROJECT_DIR/backend/server.py" > /dev/null 2>&1 &
    sleep 5
  fi
  sleep 10
done
