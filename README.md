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

The active in-app voice is **PARALLAX V6**, generated with Qwen3-TTS. The V6 VoiceDesign WAV is used as a local speaker reference by Qwen3-TTS Base, so PARALLAX can speak new responses in a voice based on the approved audition. The WAV and its matching `.txt` sidecar stay local and are not committed to Git.

The service runs on CPU by default so it does not compete with the local GLM server for NVIDIA VRAM. The first startup downloads the separate Qwen3-TTS 1.7B Base model. Keep the voice-service terminal running while using PARALLAX.

### Start the V6 voice service

The V6 audition and its sidecar should already exist under `voice-auditions/`:

- `parallax-qwen3-voice-design-v6.wav`
- `parallax-qwen3-voice-design-v6.txt`

If you need to regenerate them, see the voice-design section below. Then create the isolated Python 3.12 environment if it does not already exist:

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

Kokoro remains available as a fallback through `npm run voice:kokoro` using its existing `.venv-tts` environment. It is no longer the default in-app voice.

## Voice-design auditions

PARALLAX includes an optional Qwen3-TTS VoiceDesign audition tool. It creates an original synthetic voice from a written description; it does not use reference audio or imitate a named actor or fictional character.

The current V6 design is a distinctly low feminine contralto with a subtle Irish-English accent, relaxed conversational delivery, dry humour, and no intentional breath or mouth noises.

Run or regenerate the audition:

```bash
HF_HOME=/mnt/storage/models/huggingface npm run voice-design:audition
```

Qwen3-TTS downloads its 1.7B VoiceDesign model on first use. The default is CPU inference to keep the GLM model's GPU memory free; CPU generation will be slower. If you deliberately want to test CUDA while enough VRAM is free, run:

```bash
PARALLAX_VOICE_DEVICE=cuda:0 HF_HOME=/mnt/storage/models/huggingface npm run voice-design:audition
```

The WAV and a text file containing the exact voice description and transcript are saved under `voice-auditions/`. These outputs are ignored by Git. The in-app Qwen Base service reads the V6 WAV and its sidecar transcript to build a reusable speaker prompt at startup.

The model's official instructions and voice-design API are documented in the [Qwen3-TTS repository](https://github.com/QwenLM/Qwen3-TTS). Qwen3-TTS is Apache-2.0 licensed.
