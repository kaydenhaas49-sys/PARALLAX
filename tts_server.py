#!/usr/bin/env python3
"""Local-only Kokoro speech service for PARALLAX.

Runs on CPU by default so it does not compete with the local GLM server for
NVIDIA VRAM. Model and voice weights are cached after first use.
"""
from __future__ import annotations

import io
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
import soundfile as sf

HOST = "127.0.0.1"
PORT = int(os.environ.get("PARALLAX_TTS_PORT", "7861"))
DEVICE = os.environ.get("PARALLAX_TTS_DEVICE", "cpu")
DEFAULT_VOICE = "af_kore"
ALLOWED_VOICES = {
    "af_nicole", "af_heart", "af_aoede", "af_kore", "af_sarah",
    "af_jessica", "af_bella", "af_sky",
}
SAMPLE_RATE = 24000
PIPELINE = None
PIPELINE_LOCK = threading.Lock()


def get_pipeline():
    global PIPELINE
    if PIPELINE is None:
        from kokoro import KPipeline

        print("Loading Kokoro on " + DEVICE + "...", flush=True)
        PIPELINE = KPipeline(lang_code="a", device=DEVICE)
        PIPELINE.load_voice(DEFAULT_VOICE)
        print("Kokoro is ready.", flush=True)
    return PIPELINE


class Handler(BaseHTTPRequestHandler):
    server_version = "PARALLAX-Voice/1.0"

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
        self._json(200, {
            "status": "ready" if PIPELINE is not None else "starting",
            "engine": "kokoro",
            "voice": DEFAULT_VOICE,
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

            voice = payload.get("voice", DEFAULT_VOICE)
            if voice not in ALLOWED_VOICES:
                self._json(400, {"error": "Unsupported voice"})
                return

            speed = float(payload.get("speed", 0.92))
            if not 0.75 <= speed <= 1.5:
                self._json(400, {"error": "Speed must be between 0.75 and 1.5"})
                return

            pipeline = get_pipeline()
            with PIPELINE_LOCK:
                chunks = []
                for _, _, audio in pipeline(text.strip(), voice=voice, speed=speed):
                    if audio is None:
                        continue
                    if hasattr(audio, "detach"):
                        audio = audio.detach().cpu().numpy()
                    chunks.append(np.asarray(audio, dtype=np.float32).reshape(-1))

            if not chunks:
                self._json(500, {"error": "Kokoro produced no audio"})
                return

            pause = np.zeros(int(SAMPLE_RATE * 0.12), dtype=np.float32)
            joined = []
            for index, chunk in enumerate(chunks):
                if index:
                    joined.append(pause)
                joined.append(chunk)
            waveform = np.concatenate(joined)

            output = io.BytesIO()
            sf.write(output, waveform, SAMPLE_RATE, format="WAV", subtype="PCM_16")
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
        print("[PARALLAX voice] " + (format_string % args), flush=True)


if __name__ == "__main__":
    get_pipeline()
    print("PARALLAX voice listening at http://" + HOST + ":" + str(PORT), flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
