import { useCallback, useEffect, useRef, useState } from "react";

const WAKE_WORD = /^(?:hey\s+)?parallax\b[\s,.:;!?-]*/i;
const SILENCE_MS = 850;
const MAX_UTTERANCE_MS = 15000;
const WAKE_WINDOW_MS = 9000;

export function useAlwaysListening(onCommand) {
  const onCommandRef = useRef(onCommand);
  const pausedRef = useRef(false);
  const recorderRef = useRef(null);
  const discardRef = useRef(false);
  const [status, setStatus] = useState("starting");
  const [error, setError] = useState("");

  useEffect(() => {
    onCommandRef.current = onCommand;
  }, [onCommand]);

  const setPaused = useCallback((paused) => {
    pausedRef.current = paused;
    setStatus(paused ? "paused" : "listening");
    if (paused && recorderRef.current?.state === "recording") {
      discardRef.current = true;
      recorderRef.current.stop();
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let stream = null;
    let audioContext = null;
    let source = null;
    let analyser = null;
    let frameId = 0;
    let recorder = null;
    let chunks = [];
    let processing = false;
    let voicedFrames = 0;
    let speechStartedAt = 0;
    let lastVoiceAt = 0;
    let wakeUntil = 0;
    let lastUiStatus = "starting";
    const samples = new Uint8Array(1024);

    const updateStatus = (next, detail = "") => {
      if (next !== lastUiStatus) {
        lastUiStatus = next;
        setStatus(next);
        if (next !== "error") setError("");
      }
      if (detail) setError(detail);
    };

    const transcribeClip = async (blob) => {
      if (cancelled || pausedRef.current || processing || blob.size < 1800) return;
      processing = true;
      updateStatus("transcribing");
      try {
        const form = new FormData();
        form.append("file", blob, "parallax-utterance.webm");
        form.append("language", "en");
        const response = await fetch("/api/jarvis/v1/speech/transcribe", {
          method: "POST",
          body: form,
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.detail || "Whisper transcription failed (" + response.status + ")");
        }

        const transcript = String(payload.text || "").trim();
        if (!transcript || cancelled || pausedRef.current) return;

        const now = Date.now();
        const wakeMatch = transcript.match(WAKE_WORD);
        if (wakeMatch) {
          const command = transcript.slice(wakeMatch[0].length).trim();
          if (command) {
            wakeUntil = 0;
            onCommandRef.current?.(command);
          } else {
            wakeUntil = now + WAKE_WINDOW_MS;
            updateStatus("armed");
          }
        } else if (now < wakeUntil) {
          wakeUntil = 0;
          onCommandRef.current?.(transcript);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Speech transcription failed";
          updateStatus("error", message);
        }
      } finally {
        processing = false;
        if (!cancelled && !pausedRef.current) {
          if (wakeUntil > Date.now()) updateStatus("armed");
          else updateStatus("listening");
        }
      }
    };

    const stopCapture = () => {
      if (recorder && recorder.state === "recording") recorder.stop();
    };

    const startCapture = () => {
      if (!stream || recorder || processing || pausedRef.current) return;
      try {
        const options = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? { mimeType: "audio/webm;codecs=opus" }
          : undefined;
        const activeRecorder = new MediaRecorder(stream, options);
        recorder = activeRecorder;
        recorderRef.current = activeRecorder;
        chunks = [];
        discardRef.current = false;
        speechStartedAt = performance.now();
        lastVoiceAt = speechStartedAt;

        activeRecorder.ondataavailable = (event) => {
          if (event.data?.size) chunks.push(event.data);
        };
        activeRecorder.onstop = () => {
          if (recorder === activeRecorder) recorder = null;
          if (recorderRef.current === activeRecorder) recorderRef.current = null;
          const clip = new Blob(chunks, { type: activeRecorder.mimeType || "audio/webm" });
          chunks = [];
          if (!discardRef.current && !cancelled) void transcribeClip(clip);
          discardRef.current = false;
        };
        activeRecorder.start();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not start microphone capture";
        updateStatus("error", message);
      }
    };

    const monitorAudio = () => {
      if (cancelled || !analyser) return;
      analyser.getByteTimeDomainData(samples);
      let sumSquares = 0;
      for (let i = 0; i < samples.length; i += 1) {
        const sample = (samples[i] - 128) / 128;
        sumSquares += sample * sample;
      }
      const rms = Math.sqrt(sumSquares / samples.length);
      const now = performance.now();

      if (pausedRef.current) {
        voicedFrames = 0;
        updateStatus("paused");
      } else if (!processing && now >= 0) {
        if (recorder?.state === "recording") {
          if (rms > 0.018) lastVoiceAt = now;
          if (now - lastVoiceAt >= SILENCE_MS || now - speechStartedAt >= MAX_UTTERANCE_MS) {
            stopCapture();
          }
        } else if (rms > 0.022) {
          voicedFrames += 1;
          if (voicedFrames >= 4) {
            voicedFrames = 0;
            startCapture();
          }
        } else {
          voicedFrames = 0;
          if (wakeUntil > Date.now()) updateStatus("armed");
          else updateStatus("listening");
        }
      }
      frameId = window.requestAnimationFrame(monitorAudio);
    };

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        updateStatus("error", "This browser does not support microphone access.");
        return;
      }
      if (!window.isSecureContext) {
        updateStatus("error", "Microphone access requires localhost or a secure HTTPS connection.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        audioContext = new window.AudioContext();
        await audioContext.resume();
        source = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.12;
        source.connect(analyser);
        updateStatus("listening");
        frameId = window.requestAnimationFrame(monitorAudio);
      } catch (err) {
        stream?.getTracks().forEach((track) => track.stop());
        stream = null;
        const message = err instanceof Error ? err.message : "Microphone permission was not granted.";
        updateStatus("error", message);
      }
    };

    void start();

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
      if (recorder?.state === "recording") {
        recorder.onstop = null;
        recorder.stop();
      }
      recorderRef.current = null;
      stream?.getTracks().forEach((track) => track.stop());
      source?.disconnect();
      analyser?.disconnect();
      if (audioContext && audioContext.state !== "closed") void audioContext.close();
    };
  }, []);

  return { status, error, setPaused };
}
