#!/usr/bin/env python3
"""Local Qwen3-TTS voice-clone service for PARALLAX.

Uses the locally generated PARALLAX V6 VoiceDesign audition as its reference.
The reference WAV and its sidecar transcript stay on the user's machine.
"""
from __future__ import annotations

import io
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import soundfile as sf

HOST = "127.0.0.1"
PORT = int(os.environ.get("PARALLAX_TTS_PORT", "7861"))
DEVICE = os.environ.get("PARALLAX_TTS_DEVICE", "cpu")
MODEL_ID = "Qwen/Qwen3-TTS-12Hz-1.7B-Base"
REFERENCE_AUDIO = Path(os.environ.get(
    "PARALLAX_VOICE_REFERENCE",
    "voice-auditions/parallax-qwen3-voice-design-v6.wav",
))
MODEL = None
VOICE_CLONE_PROMPT = None
SAMPLE_RATE = 24000
ENGINE_LOCK = threading.Lock()


def load_reference_text(audio_path: Path) -> str:
    sidecar = audio_path.with_suffix(".txt")
    if not sidecar.is_file():
        raise FileNotFoundError(
            "Voice reference notes are missing: "
            + str(sidecar)
            + ". Keep the V6 WAV beside its generated .txt sidecar."
        )
    notes = sidecar.read_text(encoding="utf-8")
    marker = "AUDITION TEXT"
    if marker not in notes:
        raise ValueError("The V6 sidecar does not contain an AUDITION TEXT section.")
    transcript = notes.split(marker, 1)[1].strip()
    if not transcript:
        raise ValueError("The V6 sidecar contains an empty reference transcript.")
    return transcript


def get_engine():
    global MODEL, VOICE_CLONE_PROMPT
    if MODEL is not None and VOICE_CLONE_PROMPT is not None:
        return MODEL, VOICE_CLONE_PROMPT

    if not REFERENCE_AUDIO.is_file():
        raise FileNotFoundError(
            "PARALLAX V6 reference audio was not found at "
            + str(REFERENCE_AUDIO)
            + ". Copy the generated V6 WAV into the project first."
        )

    reference_text = load_reference_text(REFERENCE_AUDIO)

    import torch
    from qwen_tts import Qwen3TTSModel

    if DEVICE.startswith("cuda") and not torch.cuda.is_available():
        raise RuntimeError("CUDA was requested, but PyTorch cannot see a CUDA GPU.")
    if DEVICE.startswith("cuda"):
        dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
        torch.cuda.manual_seed_all(67)
    else:
        dtype = torch.float32
        torch.set_num_threads(max(1, min(os.cpu_count() or 4, 8)))

    torch.manual_seed(67)
    print("Loading " + MODEL_ID + " on " + DEVICE + "...", flush=True)
    model = Qwen3TTSModel.from_pretrained(
        MODEL_ID,
        device_map=DEVICE,
        dtype=dtype,
        attn_implementation="sdpa",
    )
    print("Building the PARALLAX V6 speaker prompt...", flush=True)
    prompt = model.create_voice_clone_prompt(
        ref_audio=str(REFERENCE_AUDIO),
        ref_text=reference_text,
        x_vector_only_mode=False,
    )
    MODEL = model
    VOICE_CLONE_PROMPT = prompt
    print("PARALLAX V6 voice is ready.", flush=True)
    return MODEL, VOICE_CLONE_PROMPT


class Handler(BaseHTTPRequestHandler):
    server_version = "PARALLAX-Qwen-Voice/1.0"

    def _json(self, status: int, payload: dict):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path not in ("/health", "/health/ready"):
            self._json(404, {"error": "Not found"})
            return
        ready = MODEL is not None and VOICE_CLONE_PROMPT is not None
        self._json(200, {
            "status": "ready" if ready else "starting",
            "engine": "qwen3-tts",
            "model": MODEL_ID,
            "voice": "PARALLAX V6",
            "reference": str(REFERENCE_AUDIO),
            "device": DEVICE,
        })

    def do_POST(self):
        if self.path != "/v1/audio/speech":
            self._json(404, {"error": "Not found"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 1_000_000:
                self._json(413, {"error": "Request must be between 1 byte and 1 MB"})
                return

            payload = json.loads(self.rfile.read(length))
            text = payload.get("input", "")
            if not isinstance(text, str) or not text.strip():
                self._json(400, {"error": "A non-empty input string is required"})
                return
            if len(text) > 5000:
                self._json(413, {"error": "Speech input is limited to 5000 characters"})
                return

            model, prompt = get_engine()
            with ENGINE_LOCK:
                import torch
                with torch.inference_mode():
                    wavs, sample_rate = model.generate_voice_clone(
                        text=text.strip(),
                        language="English",
                        voice_clone_prompt=prompt,
                    )

            if not wavs or wavs[0] is None:
                self._json(500, {"error": "Qwen3-TTS produced no audio"})
                return

            output = io.BytesIO()
            sf.write(output, wavs[0], sample_rate, format="WAV", subtype="PCM_16")
            audio_bytes = output.getvalue()
            self.send_response(200)
            self.send_header("Content-Type", "audio/wav")
            self.send_header("Content-Length", str(len(audio_bytes)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(audio_bytes)
        except Exception as exc:
            self._json(500, {"error": "Speech synthesis failed: " + str(exc)})

    def log_message(self, format_string, *args):
        print("[PARALLAX Qwen voice] " + (format_string % args), flush=True)


if __name__ == "__main__":
    get_engine()
    print("PARALLAX Qwen voice listening at http://" + HOST + ":" + str(PORT), flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
