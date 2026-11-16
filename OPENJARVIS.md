# OpenJarvis integration notes

PARALLAX tracks the upstream OpenJarvis project as a Git submodule at `vendor/OpenJarvis`.

- Upstream: https://github.com/open-jarvis/OpenJarvis
- Pinned revision: `3973503c17b6207481a90cb200c306de4a15f966`
- License: Apache License 2.0. The upstream `LICENSE` and notices remain in the submodule.

## Runtime wiring

1. `scripts/dev-full.sh` starts `jarvis serve` on `127.0.0.1:8123`.
2. OpenJarvis uses `llamacpp` by default to reach `127.0.0.1:8080`, or its native `ollama` engine to reach the local Ollama API at `127.0.0.1:11434`.
3. PARALLAX Vite proxies `/api/jarvis/*` to the OpenJarvis API and removes the `/api/jarvis` prefix.
4. The orb's chat request uses OpenJarvis `POST /v1/chat/completions`; the configured orchestrator, tools and memory participate in the actual chat path.
5. `jarvis gui --no-server` serves the official upstream frontend on `127.0.0.1:5175`; PARALLAX displays it in the Systems overlay.

The upstream source is not copied into PARALLAX's own source tree. The pinned submodule preserves source attribution, license notices and a clean update path.

## Updating OpenJarvis

Review upstream changes before advancing the pinned Git submodule:

```bash
cd vendor/OpenJarvis
git fetch origin
git log --oneline HEAD..origin/main
# Review the changelog, license and compatibility before selecting a commit.
git checkout <reviewed-commit>
cd ../..
git add vendor/OpenJarvis
git commit -m "Update pinned OpenJarvis integration"
```

## Local-data and tool-safety defaults

The starter profile binds the API to loopback, disables external analytics and keeps telemetry local. Its default tool allow-list excludes shell execution, arbitrary code execution and file writing. Those tools exist upstream but can change the local machine, so they are not enabled automatically. Review the upstream permission controls before opting into them.

Browser, web search, connectors and messaging can contact external services when deliberately configured or used. Local inference through llama.cpp does not itself require a cloud model API.


## PARALLAX desktop MCP tools

scripts/desktop_mcp.py is registered as a local stdio MCP server. It exposes prefixed tools for application discovery/launch, Hyprland window listing/focus, basic system status, PipeWire volume adjustment, explicit HTTP(S) URL opening, and bounded file-name search. It does not expose shell or file-mutation tools.

The same module runs as the loopback HTTP bridge for the DESKTOP panel. scripts/dev-full.sh starts it on 127.0.0.1:8130; Vite proxies /api/desktop/* to it. The MCP process and HTTP bridge call the same functions without giving the model an unrestricted network or command interface.


## Local inference backend selection

scripts/dev-full.sh accepts PARALLAX_ENGINE=llamacpp (default) or PARALLAX_ENGINE=ollama. PARALLAX_OLLAMA_BASE_URL configures the Ollama endpoint; PARALLAX_OLLAMA_MODEL optionally pins an installed tag. Without a pinned model OpenJarvis discovers one from Ollama's installed model list.

The launcher validates Ollama availability through /api/tags and never pulls a model automatically. The pinned OpenJarvis revision has a native Ollama engine using Ollama's /api/chat interface, including its native tool-call path. Existing llamacpp configuration remains independent. Stop and restart the OpenJarvis API after changing the selected engine.
