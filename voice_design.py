#!/usr/bin/env python3
"""Generate a first PARALLAX voice-design audition with Qwen3-TTS.

This is an original synthetic voice design. It does not use reference audio
or imitate a named actor or fictional character.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

MODEL_ID = "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign"
VOICE_DESCRIPTION = (
    "An original feminine adult English voice, mature and composed, with a "
    "clear, gently resonant mid-to-low register. Use a subtle contemporary "
    "Irish English accent with a light natural lilt, kept restrained and "
    "very easy to understand. Speak at a measured, even pace with deliberate "
    "pauses, crisp consonants, natural vowels, and steady breath support. "
    "The delivery should feel intelligent, reassuring, quietly confident, "
    "and precise. Avoid a breathy, whispery, sultry, rushed, robotic, or "
    "overly theatrical sound. Keep the same grounded vocal identity when "
    "the wording becomes urgent; convey urgency through controlled emphasis, "
    "not by speeding up. This is an original voice, not an imitation of any "
    "specific actor or character."
)
AUDITION_TEXT = (
    "Good morning. All systems are online, and the navigation route is ready.\n\n"
    "Your next appointment begins in twenty minutes. I have prepared the "
    "relevant information and placed it on your display.\n\n"
    "Attention. The forward sensors have detected an unexpected obstruction. "
    "I recommend adjusting course now.\n\n"
    "The revised route is ready. Would you like me to proceed?"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create a PARALLAX voice-design audition WAV."
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("voice-auditions/parallax-qwen3-voice-design.wav"),
        help="WAV output path (default: voice-auditions/parallax-qwen3-voice-design.wav)",
    )
    parser.add_argument(
        "--device",
        default=os.environ.get("PARALLAX_VOICE_DEVICE", "cpu"),
        help="Inference device: cpu or cuda:0 (default: cpu to leave VRAM for GLM)",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=17,
        help="Generation seed for a repeatable starting point (default: 17)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    try:
        import soundfile as sf
        import torch
        from qwen_tts import Qwen3TTSModel
    except ImportError as exc:
        print(
            "Missing voice-design dependencies. Set up .venv-voice-design "
            "using the README instructions first.\n"
            f"Import error: {exc}",
            file=sys.stderr,
        )
        return 2

    device = args.device.strip()
    if device.startswith("cuda") and not torch.cuda.is_available():
        print(
            "CUDA was requested, but PyTorch cannot see a CUDA GPU. "
            "Use --device cpu or check the PyTorch/CUDA installation.",
            file=sys.stderr,
        )
        return 2

    torch.manual_seed(args.seed)
    if device.startswith("cuda"):
        torch.cuda.manual_seed_all(args.seed)
        dtype = (
            torch.bfloat16
            if torch.cuda.is_bf16_supported()
            else torch.float16
        )
    else:
        dtype = torch.float32
        torch.set_num_threads(max(1, min(os.cpu_count() or 4, 8)))
        print(
            "CPU mode selected. The first run downloads the model and "
            "generation may take a while; GLM VRAM is left untouched.",
            flush=True,
        )

    print(f"Loading {MODEL_ID} on {device}...", flush=True)
    model = Qwen3TTSModel.from_pretrained(
        MODEL_ID,
        device_map=device,
        dtype=dtype,
        attn_implementation="sdpa",
    )

    print("Designing and generating the PARALLAX audition...", flush=True)
    wavs, sample_rate = model.generate_voice_design(
        text=AUDITION_TEXT,
        language="English",
        instruct=VOICE_DESCRIPTION,
        do_sample=True,
        temperature=0.7,
    )
    if not wavs or wavs[0] is None:
        raise RuntimeError("Qwen3-TTS returned no audio.")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    sf.write(args.output, wavs[0], sample_rate)
    sidecar = args.output.with_suffix(".txt")
    sidecar.write_text(
        "PARALLAX original voice-design audition\n"
        f"Model: {MODEL_ID}\n"
        f"Device: {device}\n"
        f"Seed: {args.seed}\n\n"
        "VOICE DESCRIPTION\n"
        f"{VOICE_DESCRIPTION}\n\n"
        "AUDITION TEXT\n"
        f"{AUDITION_TEXT}\n",
        encoding="utf-8",
    )

    print(f"Saved audition: {args.output.resolve()}", flush=True)
    print(f"Saved prompt notes: {sidecar.resolve()}", flush=True)
    print(
        "Listen to the WAV before changing PARALLAX's active TTS engine. "
        "This script does not alter the existing Kokoro service.",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
