# PARALLAX

A local-first visual prototype for PARALLAX: an independent situational-intelligence project.

The first milestone is intentionally focused: one polished, animated 3D orb with restrained controls and distinct visual states.

## What is included

- React + Vite application shell
- Three.js shader-driven orb with animated internal light patterns
- Layered orbital rings, particles, and subtle depth cues
- Four visual states: Standby, Listen, Think, and Speak
- Pointer-responsive orb orientation
- Keyboard shortcuts: `1` Standby, `2` Listen, `3` Think, `4` Speak, `Escape` Standby

## What is not connected yet

The state buttons are visual previews only. This repository does not yet connect a microphone, speech recognition, a reasoning model, persistent memory, or computer/environmental perception. The interface labels this clearly.

## Requirements

- Node.js 20 or newer
- npm

## Run locally on Omarchy / Linux

```bash
git clone https://github.com/kaydenhaas49-sys/PARALLAX.git
cd PARALLAX
npm install
npm run dev
```

Open **http://127.0.0.1:4174** in your browser.

The dev server binds to localhost and uses port 4174 with strict port checking so it will not silently choose another port.

## Production build

```bash
npm run build
npm run preview
```

The production files are written to `dist/`.

## Project structure

```
PARALLAX/
├── index.html
├── package.json
├── src/
│   ├── App.jsx
│   ├── main.jsx
│   └── styles.css
└── README.md
```

## Next milestones

1. Refine orb appearance and animation based on real-device feedback.
2. Add a local backend connection and truthful connection status.
3. Wire audio input and output with explicit user-controlled permissions.
4. Add the reasoning and perception services as separate modules.
