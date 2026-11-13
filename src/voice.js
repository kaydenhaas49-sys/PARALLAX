// Original Friday-inspired voice profile for PARALLAX.
export const PARALLAX_VOICE = Object.freeze({
  id: "af_nicole",
  name: "Nicole",
  normalSpeed: 0.92,
  urgentSpeed: 1.2,
});

const URGENT_CONTEXT =
  /\b(urgent|urgently|emergency|critical|danger|immediately|right now|asap|mayday|distress|warning|failing|losing altitude|under attack|need help|help me now)\b/i;

export function isUrgentSpeech(userText = "", assistantText = "") {
  return URGENT_CONTEXT.test(userText) || URGENT_CONTEXT.test(assistantText);
}

export function cleanSpeechText(value = "") {
  return String(value)
    .replace(/\x60{3}[\s\S]*?\x60{3}/g, "Code block omitted.")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    .replace(/\x60([^\x60]+)\x60/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function synthesizeSpeech(text, { urgent = false, signal } = {}) {
  const spokenText = cleanSpeechText(text);
  if (!spokenText) throw new Error("There is no text to speak.");

  const response = await fetch("/api/tts/v1/audio/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      model: "kokoro",
      input: spokenText,
      voice: PARALLAX_VOICE.id,
      response_format: "wav",
      speed: urgent ? PARALLAX_VOICE.urgentSpeed : PARALLAX_VOICE.normalSpeed,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || "Local voice service returned " + response.status);
  }

  return URL.createObjectURL(await response.blob());
}
