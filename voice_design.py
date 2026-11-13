#!/usr/bin/env python3
"""Generate a much lower-pitched, casual PARALLAX voice-design audition with Qwen3-TTS.

This is an original synthetic voice and conversational style. It does not use
reference audio or imitate the user's personal voice or any named performer.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

MODEL_ID = "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign"
VOICE_DESCRIPTION = (
    "Create an original feminine adult English voice for a clever onboard "
    "AI assistant. Her personality is casual, direct, quick-witted, and "
    "slightly chaotic in a fun way. She talks like a real person chatting "
    "with a familiar teammate, not like a customer-service agent or a "
    "professional presenter. Use everyday modern conversational English, "
    "contractions, informal phrasing, and occasional current casual slang "
    "where it fits naturally. She is comfortable using mild-to-moderate "
    "swearing naturally, including words like damn, hell, and shit. Do not "
    "force profanity into every sentence or make it her whole personality. "
    "Her humour is dry, cheeky, blunt, and sometimes playfully sarcastic. "
    "She can react with genuine amusement, mild disbelief, or an occasional "
    "exasperated 'seriously?' without sounding mean. Keep it spontaneous "
    "and laid-back, but still smart, capable, and dependable. Give her a "
    "distinctly low contralto speaking register, near the bottom of the natural "
    "feminine voice range. The pitch should be immediately and unmistakably "
    "lower than a typical feminine assistant voice, with a stable low-set "
    "chest resonance and a naturally full, clear tone. Keep the sound "
    "confidently feminine and intelligible, not masculine, gravelly, raspy, "
    "or artificially booming. Do not drift into a mid or high register, "
    "and avoid bright, chirpy, or sing-song delivery. "
    "This lower pitch must sound casual and matter-of-fact, not intimate, "
    "sultry, flirtatious, or seductive. Keep the accent lightly Irish-English, "
    "subtle and easy to understand. Speak at a relaxed conversational pace "
    "with natural rhythm and expressive variation, never rushed or "
    "announcer-like. When something important happens, she gets focused "
    "without suddenly turning into a stiff corporate assistant. Keep the "
    "recording clean and dry, without room ambience or reverb. Do not "
    "vocalize breathing: no audible inhalations, exhalations, sighs, gasps, "
    "lip smacks, clicks, or other mouth noises. No whispering or artificial "
    "seductive texture. This is an original voice design, not a copy of "
    "anyone's personal voice or any specific actor or fictional character."
)
AUDITION_TEXT = (
    "Right, the storm has changed direction. It's rolling straight over "
    "the observatory, and the dome sensors are having a complete meltdown. "
    "I've shut the outer shutters, rerouted the backup power, and saved "
    "your telescope alignment. You're welcome. "
    "The good news is the equipment is fine. The bad news is that little "
    "warning light is still blinking, and I'm fairly sure it's mocking us. "
    "Give me a second... there. False alarm. Just a wet sensor. "
    "Honestly, all this drama for one bit of rain. What a load of shit."
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create a PARALLAX voice-design audition WAV."
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("voice-auditions/parallax-qwen3-voice-design-v6.wav"),
        help=(
            "WAV output path "
            "(default: voice-auditions/parallax-qwen3-voice-design-v6.wav)"
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
        default=67,
        help="Generation seed for a repeatable starting point (default: 67)",
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

    print("Designing the much-lower-register PARALLAX v6 audition...", flush=True)
    wavs, sample_rate = model.generate_voice_design(
        text=AUDITION_TEXT,
        language="English",
        instruct=VOICE_DESCRIPTION,
        do_sample=True,
        temperature=0.6,
    )
    if not wavs or wavs[0] is None:
        raise RuntimeError("Qwen3-TTS returned no audio.")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    sf.write(args.output, wavs[0], sample_rate)
    sidecar = args.output.with_suffix(".txt")
    sidecar.write_text(
        "PARALLAX original voice-design audition — version 6\n"
        f"Model: {MODEL_ID}\n"
        f"Device: {device}\n"
        f"Seed: {args.seed}\n"
        "Temperature: 0.6\n\n"
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
