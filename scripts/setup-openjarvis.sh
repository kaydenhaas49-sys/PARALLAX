#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR="$ROOT/vendor/OpenJarvis"

command -v git >/dev/null 2>&1 || { echo "Git is required." >&2; exit 1; }
command -v uv >/dev/null 2>&1 || { echo "Install uv first: https://docs.astral.sh/uv/" >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo "Node.js 22.22+ is required." >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "npm 11.19+ is required." >&2; exit 1; }

git -C "$ROOT" submodule update --init --recursive vendor/OpenJarvis
[[ -f "$VENDOR/pyproject.toml" && -d "$VENDOR/frontend" ]] || {
  echo "The pinned OpenJarvis submodule did not initialize correctly." >&2
  exit 1
}

node -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (major < 22 || (major === 22 && minor < 22)) { console.error("Node.js 22.22+ is required."); process.exit(1); }'
IFS=. read -r NPM_MAJOR NPM_MINOR _ <<< "$(npm --version)"
if (( NPM_MAJOR < 11 || (NPM_MAJOR == 11 && NPM_MINOR < 19) )); then
  echo "npm 11.19+ is required (found $(npm --version))." >&2
  exit 1
fi

uv python install 3.12
(
  cd "$VENDOR"
  uv sync --python 3.12 --no-dev \
    --extra server \
    --extra desktop \
    --extra browser \
    --extra memory-bm25 \
    --extra memory-pdf \
    --extra gpu-metrics \
    --extra learning-dspy \
    --extra learning-gepa
  uv run --no-sync playwright install chromium
)
(
  cd "$VENDOR/frontend"
  npm install --no-audit --no-fund
)

OPENJARVIS_HOME="${PARALLAX_OPENJARVIS_HOME:-$HOME/.openjarvis}"
mkdir -p "$OPENJARVIS_HOME"
if [[ ! -f "$OPENJARVIS_HOME/config.toml" ]]; then
  install -m 600 "$ROOT/config/openjarvis.parallax.toml" "$OPENJARVIS_HOME/config.toml"
  echo "Created starter config at $OPENJARVIS_HOME/config.toml"
else
  echo "Keeping existing OpenJarvis config at $OPENJARVIS_HOME/config.toml"
fi

echo
echo "OpenJarvis is installed in vendor/OpenJarvis."
echo "Start the complete PARALLAX stack with: npm run dev:full"
