import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface VoiceInputStatusProps {
  isRecording: boolean;
  isProcessing: boolean;
  error?: string | null;
  recordingText: string;
  processingText?: string;
  idleText?: string;
  className?: string;
}

const VOICE_WAVE_BARS = [0.45, 0.8, 1, 0.65, 0.9, 0.55, 0.75] as const;

export function VoiceInputStatus({
  isRecording,
  isProcessing,
  error,
  recordingText,
  processingText = "Processing your audio...",
  idleText,
  className,
}: VoiceInputStatusProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {error && !isRecording && !isProcessing && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}

      {(isRecording || isProcessing) ? (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className={cn(
            "flex items-center gap-2 rounded-xl border px-3 py-2 text-xs",
            isRecording
              ? "border-red-200 bg-red-50 text-red-600"
              : "border-amber-200 bg-amber-50 text-amber-700"
          )}
        >
          {isRecording ? (
            <>
              <div className="flex items-end gap-0.5 h-4" aria-hidden="true">
                {VOICE_WAVE_BARS.map((height, index) => (
                  <span
                    key={index}
                    className="w-0.5 rounded-full bg-current origin-bottom"
                    style={{
                      height: `${height * 100}%`,
                      animation: "voiceBar 0.8s ease-in-out infinite alternate",
                      animationDelay: `${index * 0.1}s`,
                    }}
                  />
                ))}
              </div>
              <span className="font-medium">{recordingText}</span>
            </>
          ) : (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              <span className="font-medium">{processingText}</span>
            </>
          )}
        </div>
      ) : (!error && idleText) ? (
        <p className="text-[11px] text-muted-foreground/70 text-center sm:text-left">
          {idleText}
        </p>
      ) : null}
    </div>
  );
}