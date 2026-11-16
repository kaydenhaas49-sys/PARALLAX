#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR="$ROOT/vendor/OpenJarvis"
OPENJARVIS_HOME="${PARALLAX_OPENJARVIS_HOME:-$HOME/.openjarvis}"
API_PID=""
GUI_PID=""

cleanup() {
  set +e
  if [[ -n "$GUI_PID" ]] && kill -0 "$GUI_PID" 2>/dev/null; then
    kill "$GUI_PID" 2>/dev/null
    wait "$GUI_PID" 2>/dev/null
  fi
  if [[ -n "$API_PID" ]] && kill -0 "$API_PID" 2>/dev/null; then
    kill "$API_PID" 2>/dev/null
    wait "$API_PID" 2>/dev/null
  fi
}
trap cleanup EXIT INT TERM

if [[ ! -x "$VENDOR/.venv/bin/python" || ! -x "$VENDOR/frontend/node_modules/.bin/vite" ]]; then
  echo "OpenJarvis dependencies are missing; running setup first."
  "$ROOT/scripts/setup-openjarvis.sh"
fi

export OPENJARVIS_HOME
mkdir -p "$OPENJARVIS_HOME"
if [[ ! -f "$OPENJARVIS_HOME/config.toml" ]]; then
  install -m 600 "$ROOT/config/openjarvis.parallax.toml" "$OPENJARVIS_HOME/config.toml"
fi

# Add PARALLAX's local speech defaults only when no speech section exists.
# Existing user-selected speech settings are left untouched.
if ! grep -q '^\\[speech\\]' "$OPENJARVIS_HOME/config.toml"; then
  cat >> "$OPENJARVIS_HOME/config.toml" <<'TOML'

[speech]
backend = "faster-whisper"
model = "base"
language = "en"
device = "cpu"
compute_type = "int8"
tts_backend = "kokoro"
voice_id = "bm_george"
voice_speed = 1.0
TOML
fi

if curl -fsS "http://127.0.0.1:8123/health" >/dev/null 2>&1; then
  echo "Reusing the OpenJarvis API already listening on 127.0.0.1:8123."
else
  echo "Starting OpenJarvis API (llama.cpp at 127.0.0.1:8080)..."
  (
    cd "$VENDOR"
    uv run --no-sync jarvis serve --host 127.0.0.1 --port 8123 --engine llamacpp --agent orchestrator
  ) &
  API_PID=$!

  READY=0
  for _ in $(seq 1 90); do
    if curl -fsS "http://127.0.0.1:8123/health" >/dev/null 2>&1; then
      READY=1
      break
    fi
    if ! kill -0 "$API_PID" 2>/dev/null; then
      echo "OpenJarvis API exited before becoming healthy. Check the startup output." >&2
      exit 1
    fi
    sleep 1
  done
  if [[ "$READY" != "1" ]]; then
    echo "OpenJarvis API did not become healthy on port 8123." >&2
    exit 1
  fi
fi

echo "Starting the OpenJarvis systems console on 127.0.0.1:5175..."
(
  cd "$VENDOR"
  uv run --no-sync jarvis gui --no-server --frontend-port 5175 --api-port 8123 --no-browser
) &
GUI_PID=$!

echo "Starting PARALLAX on http://127.0.0.1:4174"
cd "$ROOT"
npm run dev
