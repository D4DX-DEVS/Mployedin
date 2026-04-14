"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceInputState = "idle" | "recording" | "processing";

type VoiceSubmitMode = "autoSubmitOnStop" | "explicitSend";
type StopIntent = "cancel" | "submit";

interface UseVoiceInputOptions {
  language?: string; // "en" | "ar" | "ml" | "hi" — maps to BCP-47 in API
  onTranscript?: (text: string) => void;
  onError?: (message: string) => void;
  maxDurationMs?: number;
  mode?: VoiceSubmitMode;
}

interface UseVoiceInputReturn {
  state: VoiceInputState;
  transcript: string;
  detectedLanguage: string | null;
  isRecording: boolean;
  isProcessing: boolean;
  durationMs: number;
  durationLabel: string;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  cancelRecording: () => void;
  submitRecording: () => void;
  clearTranscript: () => void;
  clearError: () => void;
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

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getFileExtension(mimeType: string): string {
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "m4a";
  return "webm";
}

function normalizeVoiceError(message?: string): string {
  const fallbackMessage = "Voice recognition failed. Please try again.";

  if (!message) {
    return fallbackMessage;
  }

  const lowered = message.toLowerCase();

  if (lowered.includes("no voice detected") || lowered.includes("could not hear") || lowered.includes("empty")) {
    return "Didn't catch that. Try again.";
  }

  return message;
}

export function useVoiceInput({
  language = "en",
  onTranscript,
  onError,
  maxDurationMs = 60000,
  mode = "autoSubmitOnStop",
}: UseVoiceInputOptions = {}): UseVoiceInputReturn {
  const [state, setState] = useState<VoiceInputState>("idle");
  const [transcript, setTranscript] = useState("");
  const [detectedLanguage, setDetectedLanguage] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  const stopIntentRef = useRef<StopIntent | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isStartingRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }

    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
  }, []);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const resetCaptureSession = useCallback(() => {
    clearTimers();
    stopTracks();
    mediaRecorderRef.current = null;
    recordingStartedAtRef.current = null;
    audioChunksRef.current = [];
    stopIntentRef.current = null;
    setDurationMs(0);
  }, [clearTimers, stopTracks]);

  const handleVoiceError = useCallback((message?: string) => {
    const normalizedMessage = normalizeVoiceError(message);
    setError(normalizedMessage);
    onError?.(normalizedMessage);
    return normalizedMessage;
  }, [onError]);

  const transcribeAudio = useCallback(async (audioBlob: Blob, mimeType: string) => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, `recording.${getFileExtension(mimeType)}`);
      formData.append("language", language);

      const res = await fetch("/api/ai/speech-to-text", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(
          (errData as { error?: string }).error ?? "Speech recognition failed"
        );
      }

      const data = await res.json() as { transcript?: string; language?: string };
      const text = data.transcript?.trim() ?? "";

      if (!text) {
        handleVoiceError("No voice detected");
        setDetectedLanguage(null);
        return;
      }

      setError(null);
      setTranscript(text);
      setDetectedLanguage(data.language ?? null);
      onTranscript?.(text);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }

      handleVoiceError(err instanceof Error ? err.message : undefined);
      setDetectedLanguage(null);
    } finally {
      abortControllerRef.current = null;
      setState("idle");
    }
  }, [handleVoiceError, language, onTranscript]);

  const finishRecording = useCallback((intent: StopIntent) => {
    const mediaRecorder = mediaRecorderRef.current;

    if (!mediaRecorder) {
      clearTimers();
      stopTracks();
      audioChunksRef.current = [];
      stopIntentRef.current = null;
      setState("idle");
      setDurationMs(0);
      return;
    }

    stopIntentRef.current = intent;
    clearTimers();

    if (intent === "submit") {
      setError(null);
      setState("processing");
    } else {
      setState("idle");
      setDurationMs(0);
    }

    if (mediaRecorder.state === "recording") {
      mediaRecorder.stop();
      return;
    }

    stopTracks();
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
    recordingStartedAtRef.current = null;
    stopIntentRef.current = null;
  }, [clearTimers, stopTracks]);

  const startRecording = useCallback(async () => {
    if (state === "recording" || state === "processing" || isStartingRef.current) return;

    isStartingRef.current = true;
    setError(null);
    setDetectedLanguage(null);
    setDurationMs(0);
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
      recordingStartedAtRef.current = Date.now();
      stopIntentRef.current = null;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stopTracks();
        clearTimers();

        const intent = stopIntentRef.current ?? (mode === "autoSubmitOnStop" ? "submit" : "cancel");
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });

        mediaRecorderRef.current = null;
        audioChunksRef.current = [];
        recordingStartedAtRef.current = null;
        stopIntentRef.current = null;
        setDurationMs(0);

        if (intent === "cancel") {
          setState("idle");
          return;
        }

        if (audioBlob.size === 0) {
          handleVoiceError("No voice detected");
          setDetectedLanguage(null);
          setState("idle");
          return;
        }

        await transcribeAudio(audioBlob, mimeType);
      };

      mediaRecorder.start(250); // collect chunks every 250ms
      setState("recording");

      durationTimerRef.current = setInterval(() => {
        if (!recordingStartedAtRef.current) {
          setDurationMs(0);
          return;
        }

        setDurationMs(Date.now() - recordingStartedAtRef.current);
      }, 250);

      autoStopTimerRef.current = setTimeout(() => {
        if (mediaRecorderRef.current?.state === "recording") {
          finishRecording("submit");
        }
      }, maxDurationMs);
    } catch (err) {
      resetCaptureSession();

      const isDenied =
        err instanceof DOMException &&
        (err.name === "NotAllowedError" || err.name === "PermissionDeniedError");

      const msg = isDenied
        ? "Microphone access denied. Please allow microphone access in browser settings."
        : "Could not access microphone. Please check your device.";

      handleVoiceError(msg);
      setState("idle");
    } finally {
      isStartingRef.current = false;
    }
  }, [finishRecording, handleVoiceError, maxDurationMs, resetCaptureSession, state, transcribeAudio]);

  const stopRecording = useCallback(() => {
    if (mode === "explicitSend") {
      finishRecording("cancel");
      return;
    }

    finishRecording("submit");
  }, [finishRecording, mode]);

  const cancelRecording = useCallback(() => {
    finishRecording("cancel");
  }, [finishRecording]);

  const submitRecording = useCallback(() => {
    finishRecording("submit");
  }, [finishRecording]);

  const clearTranscript = useCallback(() => {
    setTranscript("");
    setError(null);
    setDetectedLanguage(null);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      resetCaptureSession();
    };
  }, [resetCaptureSession]);

  return {
    state,
    transcript,
    detectedLanguage,
    isRecording: state === "recording",
    isProcessing: state === "processing",
    durationMs,
    durationLabel: formatDuration(durationMs),
    startRecording,
    stopRecording,
    cancelRecording,
    submitRecording,
    clearTranscript,
    clearError,
    error,
  };
}
