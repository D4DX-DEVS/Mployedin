"use client";

import { useState, useRef, useCallback } from "react";

export type VoiceInputState = "idle" | "recording" | "processing" | "error";

interface UseVoiceInputOptions {
  language?: string; // "en" | "ar" | "ml" | "hi" — maps to BCP-47 in API
  onTranscript?: (text: string) => void;
  onError?: (message: string) => void;
  maxDurationMs?: number; // auto-stop after this many ms (default 30000)
}

interface UseVoiceInputReturn {
  state: VoiceInputState;
  transcript: string;
  isRecording: boolean;
  isProcessing: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  clearTranscript: () => void;
  error: string | null;
}

const MIME_TYPES_PRIORITY = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
];

function getSupportedMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "audio/webm";
  for (const type of MIME_TYPES_PRIORITY) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "audio/webm";
}

export function useVoiceInput({
  language = "en",
  onTranscript,
  onError,
  maxDurationMs = 30000,
}: UseVoiceInputOptions = {}): UseVoiceInputReturn {
  const [state, setState] = useState<VoiceInputState>("idle");
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startRecording = useCallback(async () => {
    if (state === "recording" || state === "processing") return;

    setError(null);
    setState("recording");
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      const mimeType = getSupportedMimeType();
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Stop all tracks
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        setState("processing");

        try {
          const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
          const formData = new FormData();
          formData.append("audio", audioBlob, `recording.${mimeType.split("/")[1].split(";")[0]}`);
          formData.append("language", language);

          const res = await fetch("/api/ai/speech-to-text", {
            method: "POST",
            body: formData,
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(
              (errData as { error?: string }).error ?? "Speech recognition failed"
            );
          }

          const data = await res.json() as { transcript?: string };
          const text = data.transcript ?? "";

          if (text) {
            setTranscript(text);
            onTranscript?.(text);
          } else {
            const msg = "No speech detected. Please try again.";
            setError(msg);
            onError?.(msg);
          }
          setState("idle");
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : "Voice recognition failed";
          setError(msg);
          onError?.(msg);
          setState("error");
        }
      };

      mediaRecorder.start(250); // collect chunks every 250ms

      // Auto-stop after maxDurationMs to avoid runaway recordings
      autoStopTimerRef.current = setTimeout(() => {
        if (mediaRecorderRef.current?.state === "recording") {
          mediaRecorderRef.current.requestData();
          mediaRecorderRef.current.stop();
        }
      }, maxDurationMs);
    } catch (err) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;

      const isDenied =
        err instanceof DOMException &&
        (err.name === "NotAllowedError" || err.name === "PermissionDeniedError");

      const msg = isDenied
        ? "Microphone access denied. Please allow microphone access in browser settings."
        : "Could not access microphone. Please check your device.";

      setError(msg);
      onError?.(msg);
      setState("error");
    }
  }, [state, language, onTranscript, onError]);

  const stopRecording = useCallback(() => {
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      // Flush any buffered audio before stopping so the final chunk isn't lost
      mediaRecorderRef.current.requestData();
      mediaRecorderRef.current.stop();
    }
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscript("");
    setError(null);
    setState("idle");
  }, []);

  return {
    state,
    transcript,
    isRecording: state === "recording",
    isProcessing: state === "processing",
    startRecording,
    stopRecording,
    clearTranscript,
    error,
  };
}
