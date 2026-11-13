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
