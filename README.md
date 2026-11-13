# PARALLAX

A minimal, local-first AI assistant with a reactive Three.js orb interface, powered by your local GLM model.

## Included

- React + Vite application with a Three.js cinematic orb
- Local GLM chat through an OpenAI-compatible API
- Conversation history for the current session
- Orb states react to the conversation:
  - `1` — Standby
  - `2` — Listening
  - `3` — Thinking
  - `4` — Speaking
  - `Escape` — Standby
- The GLM API is accessed through a local Vite proxy; the browser does not call a cloud service.

## Requirements

- Node.js 20 or newer
- npm
- Your GLM server running locally with an OpenAI-compatible API on port `8080`

## Run locally on Linux

```bash
git clone https://github.com/kaydenhaas49-sys/PARALLAX.git
cd PARALLAX
npm install
cp .env.example .env
npm run dev
```

Open **http://127.0.0.1:4174**.

By default, PARALLAX expects GLM at `http://127.0.0.1:8080` and discovers the model ID from `/v1/models`. Set `GLM_BASE_URL` in `.env` if your local GLM API uses a different base address. The base address should not include the `/v1` suffix.

## Production build

```bash
npm run build
npm run preview
```

The preview server also proxies GLM locally. Production files are written to `dist/`.

## Local voice — Friday-inspired

PARALLAX has an original, feminine American-English voice profile inspired by the clear,
composed, quick-thinking delivery of cinematic AI assistants. It is not a recreation of
a movie character or actor.

- Local Kokoro-82M speech synthesis; no cloud TTS.
- Default voice preset: Kokoro `af_nicole`.
- Normal delivery: measured, at speed `0.92`.
- Urgent delivery: faster and more concise, at speed `1.20`, selected from the conversation context.
- The voice toggle beside the message field mutes or enables speech.
- The voice server runs on CPU by default so it does not compete with GLM for GPU memory.

### Install the local voice engine on Linux

The voice engine uses a separate Python 3.12 environment so it does not modify the
Python environments used by other projects.

```bash
sudo pacman -S espeak-ng
uv python install 3.12
uv venv --python 3.12 .venv-tts
uv pip install --python .venv-tts/bin/python -r requirements-tts.txt
```

Start the voice service in its own terminal:

```bash
cd ~/Projects/PARALLAX
npm run voice
```

The first startup downloads the Kokoro model and the selected voice preset. After that,
speech synthesis runs locally using the cached files. Keep this terminal running while
using PARALLAX. In another terminal, start the web app with `npm run dev`.

The voice service binds only to `127.0.0.1:7861`. The Vite development and preview
servers proxy speech requests to it. Set `PARALLAX_TTS_BASE_URL` in `.env` if you
need a different local port or host.

Kokoro's model is open-weight and Apache-2.0 licensed. See the
[official Kokoro usage documentation](https://github.com/NVIDIA/kokoro).
