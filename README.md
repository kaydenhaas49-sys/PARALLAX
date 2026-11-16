# PARALLAX

A local-first personal AI assistant with a reactive Three.js orb, the PARALLAX V6 Qwen3-TTS voice, and the OpenJarvis personal-AI platform.

## OpenJarvis integration

PARALLAX keeps its custom orb and in-app voice. OpenJarvis supplies the agent and personal-AI platform behind it.

The upstream OpenJarvis repository is included as a pinned Git submodule at `vendor/OpenJarvis` (Apache-2.0). Its original source, license and notices remain intact in that checkout.

The integration brings the upstream capabilities into PARALLAX:

- **Agents:** orchestrator, ReAct, operative and monitoring agents, deep research, morning digest, and code-oriented agents.
- **Memory and retrieval:** persistent local facts, document indexing, SQLite/FTS, and optional BM25, FAISS, ColBERT and PDF retrieval.
- **Tools and MCP:** the upstream tool registry, calculator, web search, browser, file and knowledge tools, plus MCP client/server support.
- **Skills and workflows:** skill catalog and import/sync support, recipes, workflows and scheduled agents.
- **Models and engines:** model discovery, model routing and the supported inference engines, including llama.cpp.
- **Learning and evaluation:** routing policies, agent/skill optimizers, trace-driven learning, benchmarks and evaluation workflows.
- **Telemetry:** local inference traces, performance statistics and hardware/energy metrics.
- **Connectors and channels:** upstream connector, digest, and messaging/channel systems, with provider-specific setup where required.

The **SYSTEMS** control on the PARALLAX screen opens the official OpenJarvis web console inside PARALLAX. That exposes the upstream chat, dashboard, settings, agent manager, data sources, logs and related management pages without replacing the orb interface.

## Local architecture

| Service | Address | Purpose |
|---|---|---|
| PARALLAX | `http://127.0.0.1:4174` | Orb, main chat and voice |
| OpenJarvis web console | `http://127.0.0.1:5175` | Official upstream management UI |
| OpenJarvis API | `http://127.0.0.1:8123` | Agents, memory, tools, routing and telemetry |
| llama.cpp | `http://127.0.0.1:8080` | Local model inference |
| Qwen3-TTS | `http://127.0.0.1:7861` | PARALLAX V6 speech service |

The main PARALLAX chat sends OpenAI-compatible chat requests to OpenJarvis `/v1/chat/completions`. OpenJarvis uses its `llamacpp` engine to call the existing local llama.cpp server. Your GGUF models remain managed by llama.cpp; this integration does not replace your models or switch inference to a cloud API.

Local inference is the default. Web search, browser access, connectors and messaging integrations can contact external services when those features are deliberately used and configured. External OpenJarvis analytics are disabled in the starter profile; local telemetry remains enabled.

## Requirements

- Linux (the setup scripts target Omarchy/Arch)
- Git with submodule support
- Node.js **22.22+** and npm **11.19+** for the upstream OpenJarvis frontend
- [uv](https://docs.astral.sh/uv/)
- A local llama.cpp `llama-server` exposing an OpenAI-compatible API at `127.0.0.1:8080`
- The existing PARALLAX Qwen3-TTS environment for in-app speech

OpenJarvis supports Python 3.10–3.13. The setup script installs and uses Python 3.12 in its own environment, separate from PARALLAX's voice environments.

## First-time setup

Clone PARALLAX with its pinned OpenJarvis submodule:

```bash
git clone --recurse-submodules https://github.com/kaydenhaas49-sys/PARALLAX.git
cd PARALLAX
npm install
cp .env.example .env
npm run setup:openjarvis
```

Then start the complete stack:

```bash
npm run dev:full
```

Open **http://127.0.0.1:4174**. Start the Qwen voice service separately in another terminal if you want spoken responses:

```bash
HF_HOME=/mnt/storage/models/huggingface npm run voice
```

If PARALLAX was cloned without submodules, `npm run setup:openjarvis` initializes the pinned submodule automatically.

### OpenJarvis configuration and data

The setup creates `~/.openjarvis/config.toml` from `config/openjarvis.parallax.toml` only when no config already exists. Existing OpenJarvis configuration and data are not overwritten. To use a different state directory, set `PARALLAX_OPENJARVIS_HOME` before setup or startup.

The starter profile points OpenJarvis at llama.cpp on port 8080, runs its API on loopback port 8123, enables the orchestrator, persistent SQLite memory, the MCP adapter, local telemetry and the learning framework.

For safety, the starter tool allow-list excludes shell execution, arbitrary code execution and file writing. Those capabilities exist upstream but are not enabled automatically. Review OpenJarvis's permission controls and the impact of each tool before enabling them.

The setup installs the server, desktop, browser, BM25/PDF memory, GPU metrics, learning, Faster-Whisper speech recognition and Kokoro text-to-speech extras. Other provider-specific connectors, channels and alternative inference engines may require additional optional packages, credentials or services; they are not silently enabled.

### Hands-free voice

PARALLAX automatically requests microphone access when its page opens. There is no in-app button to start listening. The mic status stays visible in the composer. The browser still requires the user to grant microphone permission; revoke it through the browser's site permissions or the operating system's microphone privacy settings.

The microphone stream is analyzed locally for speech activity. Audio is held in memory only long enough to make a short utterance clip; Whisper transcribes that clip through the local OpenJarvis API. The clip is not saved as a recording or sent to a cloud transcription provider. OpenJarvis uses a temporary file during Faster-Whisper processing and removes it after transcription.

The wake phrase is **“Parallax”** (also accepts “Hey Parallax”). PARALLAX only sends a command to the chat agent after that wake phrase; other nearby speech is transcribed locally for wake-word matching and then discarded. After saying only the wake phrase, speak the command within about nine seconds. Voice activity detection is a lightweight energy threshold, not a dedicated wake-word model, so quiet speech or noisy rooms can affect detection.

The starter profile runs Faster-Whisper `base` on the CPU with `int8` to avoid competing with llama.cpp for GPU memory. The model downloads the first time it starts. Kokoro voices are selected from the voice menu in the PARALLAX composer; PARALLAX V6 remains available through the existing Qwen3-TTS service.

Kokoro English voices need the system `espeak-ng` package. On Arch/Omarchy install it with:

```bash
sudo pacman -S espeak-ng
```

The available Kokoro English choices include George, Lewis, Emma, Isabella, Heart, Bella, Nicole, Sarah, Sky, Adam and Michael. OpenJarvis also supports other Kokoro languages when matching language resources are installed.

## Running PARALLAX without the full launcher

`npm run dev` starts only the PARALLAX Vite app. For the agent-backed experience, use `npm run dev:full`, which starts the local OpenJarvis API and upstream console alongside PARALLAX. The existing `npm run build` command still builds the PARALLAX frontend.

## Local voice

The active in-app voice is **PARALLAX V6**, generated with Qwen3-TTS. The V6 VoiceDesign WAV is used as a local speaker reference by Qwen3-TTS Base, so PARALLAX can speak new responses in a voice based on the approved audition. The WAV and its matching `.txt` sidecar stay local and are not committed to Git.

The service runs on CPU by default so it does not compete with the local model server for NVIDIA VRAM. The first startup downloads the separate Qwen3-TTS 1.7B Base model. Keep the voice-service terminal running while using PARALLAX.

### Start the V6 voice service

The V6 audition and its sidecar should exist under `voice-auditions/`:

- `parallax-qwen3-voice-design-v6.wav`
- `parallax-qwen3-voice-design-v6.txt`

If needed, create the isolated Python 3.12 environment:

```bash
uv python install 3.12
uv venv --python 3.12 .venv-voice-design
uv pip install --python .venv-voice-design/bin/python -r requirements-voice-design.txt
```

Start the active Qwen voice service in its own terminal:

```bash
HF_HOME=/mnt/storage/models/huggingface npm run voice
```

It listens only on `127.0.0.1:7861`; Vite proxies speech requests to it. The reference path can be changed with `PARALLAX_VOICE_REFERENCE`, and the inference device with `PARALLAX_TTS_DEVICE` (CPU by default).

Kokoro remains available as a fallback through `npm run voice:kokoro` using its existing `.venv-tts` environment.

## Voice-design auditions

PARALLAX includes an optional Qwen3-TTS VoiceDesign audition tool. It creates an original synthetic voice from a written description; it does not use reference audio or imitate a named actor or fictional character.

The current V6 design is a low feminine contralto with a subtle Irish-English accent, relaxed conversational delivery, dry humour and no intentional breath or mouth noises.

Run or regenerate the audition:

```bash
HF_HOME=/mnt/storage/models/huggingface npm run voice-design:audition
```

Qwen3-TTS downloads its 1.7B VoiceDesign model on first use. The default is CPU inference to keep the local model's GPU memory free. To deliberately test CUDA while enough VRAM is free:

```bash
PARALLAX_VOICE_DEVICE=cuda:0 HF_HOME=/mnt/storage/models/huggingface npm run voice-design:audition
```

The WAV and a text file containing the exact voice description and transcript are saved under `voice-auditions/`. These outputs are ignored by Git. The in-app Qwen Base service reads the V6 WAV and its sidecar transcript to build a reusable speaker prompt at startup.

The [Qwen3-TTS repository](https://github.com/QwenLM/Qwen3-TTS) documents the voice-design API. Qwen3-TTS is Apache-2.0 licensed.

## Upstream project

- [OpenJarvis source](https://github.com/open-jarvis/OpenJarvis)
- [OpenJarvis documentation](https://open-jarvis.github.io/OpenJarvis/)
- [Stanford research paper](https://arxiv.org/abs/2605.17172)

See [OPENJARVIS.md](OPENJARVIS.md) for the integration boundary, pinned revision and update procedure.


## Desktop companion tools

The full launcher starts a local PARALLAX desktop bridge on loopback port 8130. Open DESKTOP in the orb UI to browse installed applications and Steam games, inspect basic system status, focus open Hyprland windows, and adjust PipeWire output volume.

OpenJarvis discovers the same capabilities through a local parallax-desktop MCP server. The assistant can launch an already-installed desktop application or detected Steam game by name, list/focus Hyprland windows, read basic local system status, adjust audio, open a user-requested HTTP/HTTPS URL, and search file/folder names in normal user folders. Steam discovery uses installed appmanifest_*.acf files; PARALLAX does not install missing games.

The desktop bridge binds only to 127.0.0.1. Its HTTP interface accepts state-changing requests only from the local PARALLAX web origin. The MCP server exposes named operations only: no terminal, arbitrary shell, general-purpose command runner, file writing/deletion, package installation, or administrator access. File search matches names only and does not read file contents.

npm run setup:openjarvis and npm run dev:full merge the desktop MCP server and tool names into ~/.openjarvis/config.toml. A one-time owner-readable backup is created before the config is changed. If OpenJarvis was already running before the desktop tools were added, restart its API so it reloads the MCP server configuration.
