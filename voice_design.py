#!/usr/bin/env python3
"""Generate a more relaxed, witty PARALLAX voice-design audition with Qwen3-TTS.

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
    "Create an original feminine adult English voice for a clever onboard "
    "AI assistant. She sounds like a capable, quick-witted person who is "
    "comfortable in her own skin: relaxed, friendly, lightly playful, and "
    "naturally conversational. Her humour is dry and understated, with a "
    "hint of cheekiness, never exaggerated or cartoonish. Use a clear, "
    "natural medium register with an easy, bright tone. Avoid a deliberately "
    "low, husky, breathy, intimate, sultry, flirtatious, or seductive sound. "
    "Do not make her sound like a formal presenter, corporate receptionist, "
    "newsreader, or stern navigation computer. Keep the accent lightly "
    "Irish-English, subtle and easy to understand. Speak at a comfortable "
    "conversational pace, with natural rhythm, small expressive shifts, and "
    "the occasional understated amused note. She can sound genuinely pleased, "
    "mildly unimpressed, or playfully sarcastic when the words call for it, "
    "but never overact. Stay clear and composed when delivering important "
    "alerts. Keep the recording clean and dry, without room ambience or "
    "reverb. Do not vocalize breathing: no audible inhalations, exhalations, "
    "sighs, gasps, lip smacks, clicks, or other mouth noises. No whispering, "
    "vocal fry, or artificial seductive texture. This is an original voice, "
    "not an imitation of any specific actor or fictional character."
)
AUDITION_TEXT = (
    "Morning. Good news: everything is online and behaving itself. "
    "For now, anyway. "
    "Your next appointment starts in twenty minutes. I've put the details "
    "on your display, so there's no need to pretend you remembered. "
    "Quick heads-up. There's something blocking the route ahead. "
    "I'd suggest turning left. Trust me, arguing with the wall won't help. "
    "New route is ready. Shall we give that one a try?"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create a PARALLAX voice-design audition WAV."
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("voice-auditions/parallax-qwen3-voice-design-v3.wav"),
        help=(
            "WAV output path "
            "(default: voice-auditions/parallax-qwen3-voice-design-v3.wav)"
        ),
    )
    parser.add_argument(
        "--device",
        default=os.environ.get("PARALLAX_VOICE_DEVICE", "cpu"),
        help="Inference device: cpu or cuda:0 (default: cpu to leave VRAM for GLM)",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=41,
        help="Generation seed for a repeatable starting point (default: 41)",
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

    print("Designing the relaxed PARALLAX v3 audition...", flush=True)
    wavs, sample_rate = model.generate_voice_design(
        text=AUDITION_TEXT,
        language="English",
        instruct=VOICE_DESCRIPTION,
        do_sample=True,
        temperature=0.55,
    )
    if not wavs or wavs[0] is None:
        raise RuntimeError("Qwen3-TTS returned no audio.")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    sf.write(args.output, wavs[0], sample_rate)
    sidecar = args.output.with_suffix(".txt")
    sidecar.write_text(
        "PARALLAX original voice-design audition — version 3\n"
        f"Model: {MODEL_ID}\n"
        f"Device: {device}\n"
        f"Seed: {args.seed}\n"
        "Temperature: 0.55\n\n"
        "VOICE DESCRIPTION\n"
        f"{VOICE_DESCRIPTION}\n\n"
        "AUDITION TEXT\n"
        f"{AUDITION_TEXT}\n",
        encoding="utf-8",
    )

    print(f"Saved audition: {args.output.resolve()}", flush=True)
    print(f"Saved prompt notes: {sidecar.resolve()}", flush=True)
    print(
        "This is a separate audition only; PARALLAX's active Kokoro service "
        "has not been changed.",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
