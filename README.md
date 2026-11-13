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

The preview server also proxies GLM and local voice requests. Production files are written to `dist/`.

## Local voice

The active in-app voice service remains Kokoro for now. Its current voice is `bf_emma` (British English), with measured default delivery and a slightly quicker urgent setting. The server runs on CPU by default so it does not compete with the local GLM server for NVIDIA VRAM.

### Install and run Kokoro

The voice engine uses its own Python 3.12 environment.

```bash
sudo pacman -S espeak-ng
uv python install 3.12
uv venv --python 3.12 .venv-tts
uv pip install --python .venv-tts/bin/python -r requirements-tts.txt
```

Start the voice service in its own terminal:

```bash
npm run voice
```

The first startup downloads the Kokoro model and selected voice preset. After that, synthesis uses the local cache. Keep this terminal running while using PARALLAX.

The service binds only to `127.0.0.1:7861`. Vite proxies speech requests to it. Set `PARALLAX_TTS_BASE_URL` in `.env` for a different local host or port.

## Experimental original voice design

PARALLAX now includes an **optional Qwen3-TTS VoiceDesign audition**. It creates an original synthetic voice from a written description; it does not use reference audio or imitate a named actor or fictional character. This is an audition tool only: it does not replace the active Kokoro service.

The first audition is designed to test a composed feminine voice with a subtle Irish-English lilt, a clear mid-to-low register, deliberate pacing, and controlled emphasis. It generates one WAV containing neutral, informative, and alert lines so the delivery can be judged in context.

### Set up the separate voice-design environment

Use a separate Python 3.12 environment so Qwen's dependencies do not change Kokoro's environment:

```bash
uv python install 3.12
uv venv --python 3.12 .venv-voice-design
uv pip install --python .venv-voice-design/bin/python -r requirements-voice-design.txt
```

Run the first audition:

```bash
HF_HOME=/mnt/storage/models/huggingface npm run voice-design:audition
```

Qwen3-TTS downloads its 1.7B VoiceDesign model on first use. The default is CPU inference to keep the GLM model's GPU memory free; CPU generation will be slower. If you deliberately want to test CUDA while enough VRAM is free, run:

```bash
PARALLAX_VOICE_DEVICE=cuda:0 HF_HOME=/mnt/storage/models/huggingface npm run voice-design:audition
```

The WAV and a text file containing the exact voice description are saved under `voice-auditions/`. These outputs are ignored by Git. Listen to the WAV before changing the live TTS engine.

The model's official instructions and voice-design API are documented in the [Qwen3-TTS repository](https://github.com/QwenLM/Qwen3-TTS). Qwen3-TTS is Apache-2.0 licensed.
