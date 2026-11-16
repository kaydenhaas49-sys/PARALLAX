#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR="$ROOT/vendor/OpenJarvis"
OPENJARVIS_HOME="${PARALLAX_OPENJARVIS_HOME:-$HOME/.openjarvis}"

# Read only PARALLAX backend settings from .env without executing the file.
# Variables already exported by the caller take precedence.
load_env_setting() {
  local name="$1" line key value
  case "$name" in
    PARALLAX_ENGINE) [[ -n "${PARALLAX_ENGINE:-}" ]] && return 0 ;;
    PARALLAX_OLLAMA_BASE_URL) [[ -n "${PARALLAX_OLLAMA_BASE_URL:-}" ]] && return 0 ;;
    PARALLAX_OLLAMA_MODEL) [[ -n "${PARALLAX_OLLAMA_MODEL:-}" ]] && return 0 ;;
  esac
  [[ -f "$ROOT/.env" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" == *=* ]] || continue
    key="${line%%=*}"
    key="${key//[[:space:]]/}"
    [[ "$key" == "$name" ]] || continue
    value="${line#*=}"
    if [[ "$value" == \"* ]]; then value="${value#\"}"; fi
    if [[ "$value" == *\" ]]; then value="${value%\"}"; fi
    if [[ "$value" == \'* ]]; then value="${value#\'}"; fi
    if [[ "$value" == *\' ]]; then value="${value%\'}"; fi
    printf -v "$name" '%s' "$value"
    export "$name"
    return 0
  done < "$ROOT/.env"
}
for setting in PARALLAX_ENGINE PARALLAX_OLLAMA_BASE_URL PARALLAX_OLLAMA_MODEL; do
  load_env_setting "$setting"
done
API_PID=""
GUI_PID=""
DESKTOP_PID=""

cleanup() {
  set +e
  if [[ -n "$GUI_PID" ]] && kill -0 "$GUI_PID" 2>/dev/null; then
    kill "$GUI_PID" 2>/dev/null
    wait "$GUI_PID" 2>/dev/null
  fi
  if [[ -n "$DESKTOP_PID" ]] && kill -0 "$DESKTOP_PID" 2>/dev/null; then
    kill "$DESKTOP_PID" 2>/dev/null
    wait "$DESKTOP_PID" 2>/dev/null
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
if ! grep -Fqx '[speech]' "$OPENJARVIS_HOME/config.toml"; then
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

python3 "$ROOT/scripts/merge_openjarvis_config.py" "$OPENJARVIS_HOME/config.toml" "$ROOT/scripts/desktop_mcp.py"


ENGINE="${PARALLAX_ENGINE:-llamacpp}"
ENGINE_ARGS=()
case "$ENGINE" in
  llamacpp)
    ENGINE_ARGS=(--engine llamacpp)
    echo "Selected inference backend: llama.cpp (127.0.0.1:8080)"
    ;;
  ollama)
    # An explicit host in the user's OpenJarvis config takes precedence.
    CONFIG_OLLAMA_HOST="$(python3 - "$OPENJARVIS_HOME/config.toml" <<'PY'
import sys
import tomllib
with open(sys.argv[1], "rb") as handle:
    config = tomllib.load(handle)
print(config.get("engine", {}).get("ollama", {}).get("host", "") or "")
PY
)"
    OLLAMA_HOST="${CONFIG_OLLAMA_HOST:-${PARALLAX_OLLAMA_BASE_URL:-${OLLAMA_HOST:-http://127.0.0.1:11434}}}"
    OLLAMA_HOST="${OLLAMA_HOST%/}"
    export OLLAMA_HOST
    if ! curl -fsS "$OLLAMA_HOST/api/tags" >/dev/null 2>&1; then
      echo "Ollama is not reachable at $OLLAMA_HOST." >&2
      echo "Start Ollama and make sure at least one model is installed, then retry." >&2
      echo "Check installed models with: ollama list" >&2
      exit 1
    fi
    ENGINE_ARGS=(--engine ollama)
    if [[ -n "${PARALLAX_OLLAMA_MODEL:-}" ]]; then
      if ! curl -fsS "$OLLAMA_HOST/api/tags" | python3 -c 'import json,sys; wanted=sys.argv[1]; data=json.load(sys.stdin); names={entry.get("name") or entry.get("model") for entry in data.get("models", [])}; sys.exit(0 if wanted in names else 1)' "$PARALLAX_OLLAMA_MODEL"; then
        echo "Ollama model '$PARALLAX_OLLAMA_MODEL' was not found at $OLLAMA_HOST." >&2
        echo "Check the exact tag with: ollama list" >&2
        exit 1
      fi
      ENGINE_ARGS+=(--model "$PARALLAX_OLLAMA_MODEL")
    fi
    echo "Selected inference backend: Ollama ($OLLAMA_HOST)"
    if [[ -n "${PARALLAX_OLLAMA_MODEL:-}" ]]; then
      echo "Selected Ollama model: $PARALLAX_OLLAMA_MODEL"
    else
      echo "Ollama model: automatic discovery from installed models"
    fi
    ;;
  *)
    echo "Unsupported PARALLAX_ENGINE '$ENGINE'. Choose 'llamacpp' or 'ollama'." >&2
    exit 2
    ;;
esac

if curl -fsS "http://127.0.0.1:8130/health" >/dev/null 2>&1; then
  echo "Reusing the PARALLAX desktop bridge on 127.0.0.1:8130."
else
  echo "Starting the allow-listed PARALLAX desktop bridge on 127.0.0.1:8130..."
  python3 "$ROOT/scripts/desktop_mcp.py" --http --host 127.0.0.1 --port 8130 &
  DESKTOP_PID=$!
  READY=0
  for _ in $(seq 1 20); do
    if curl -fsS "http://127.0.0.1:8130/health" >/dev/null 2>&1; then READY=1; break; fi
    if ! kill -0 "$DESKTOP_PID" 2>/dev/null; then echo "Desktop bridge exited before becoming healthy." >&2; exit 1; fi
    sleep 1
  done
  if [[ "$READY" != "1" ]]; then echo "Desktop bridge did not become healthy on port 8130." >&2; exit 1; fi
fi

if curl -fsS "http://127.0.0.1:8123/health" >/dev/null 2>&1; then
  echo "Reusing the OpenJarvis API already listening on 127.0.0.1:8123."
  echo "An existing API cannot switch engines live. Stop the process on port 8123 and restart to apply PARALLAX_ENGINE=$ENGINE."
else
  echo "Starting OpenJarvis API with the $ENGINE inference backend..."
  (
    cd "$VENDOR"
    uv run --no-sync jarvis serve --host 127.0.0.1 --port 8123 "${ENGINE_ARGS[@]}" --agent orchestrator
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

# Keep the chat UI's explicit model in sync with the model selected for OpenJarvis.
# The UI sends its model field on each request, so it must not choose Ollama's first tag.
if [[ "$ENGINE" == "ollama" && -n "${PARALLAX_OLLAMA_MODEL:-}" ]]; then
  export VITE_PARALLAX_MODEL="$PARALLAX_OLLAMA_MODEL"
  echo "PARALLAX chat model override: $VITE_PARALLAX_MODEL"
else
  unset VITE_PARALLAX_MODEL
fi

echo "Starting PARALLAX on http://127.0.0.1:4174"
cd "$ROOT"
npm run dev
