# PARALLAX

A minimal, local-first visual prototype for PARALLAX: an independent situational-intelligence project.

The interface is intentionally just the animated 3D orb. There are no dashboards, panels, labels, or on-screen controls.

## Included

- React + Vite application
- Three.js shader-driven orb with animated internal light patterns
- Subtle orbital rings, particles, and atmospheric glow
- Four visual states accessible through keyboard shortcuts:
  - `1` — Standby
  - `2` — Listening
  - `3` — Thinking
  - `4` — Speaking
  - `Escape` — Standby

The states currently change the visualization only. Microphone, speech recognition, reasoning, memory, and perception services are not connected yet.

## Requirements

- Node.js 20 or newer
- npm

## Run locally on Linux

```bash
git clone https://github.com/kaydenhaas49-sys/PARALLAX.git
cd PARALLAX
npm install
npm run dev
```

Open **http://127.0.0.1:4174**.

The development server binds to localhost and uses strict port checking.

## Production build

```bash
npm run build
npm run preview
```

Production files are written to `dist/`.
