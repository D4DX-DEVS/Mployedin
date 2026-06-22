"use client";

interface ScoreRingProps {
  /** Match score 0-100. When undefined the ring renders an empty/idle state. */
  value?: number;
  /** Outer diameter in pixels. */
  size?: number;
  /** Ring thickness in pixels. */
  strokeWidth?: number;
  /** Small caption rendered under the percentage (e.g. "AI Match"). */
  label?: string;
  /** Text shown when no score is available yet. */
  emptyLabel?: string;
  className?: string;
}

function ringColor(value?: number): string {
  if (value == null) return "#cbd5e1"; // slate-300
  if (value >= 80) return "#10b981"; // emerald-500
  if (value >= 60) return "#f59e0b"; // amber-500
  return "#f43f5e"; // rose-500
}

/**
 * Lightweight SVG donut used to surface the AI match score as the focal point
 * of candidate cards and the detail panel. Pure presentational, no deps.
 */
export function ScoreRing({ value, size = 56, strokeWidth = 5, label, emptyLabel = "—", className }: ScoreRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = value != null ? Math.max(0, Math.min(100, value)) : 0;
  const dash = (clamped / 100) * circumference;
  const color = ringColor(value);

  return (
    <div className={`relative inline-flex shrink-0 items-center justify-center ${className ?? ""}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-slate-200 dark:text-slate-700"
        />
        {value != null ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference - dash}`}
          />
        ) : null}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-none">
        {value != null ? (
          <>
            <span className="font-bold text-foreground" style={{ fontSize: size * 0.26 }}>
              {Math.round(value)}%
            </span>
            {label ? (
              <span className="mt-0.5 font-medium text-muted-foreground" style={{ fontSize: size * 0.14 }}>
                {label}
              </span>
            ) : null}
          </>
        ) : (
          <span className="font-semibold text-muted-foreground" style={{ fontSize: size * 0.22 }}>
            {emptyLabel}
          </span>
        )}
      </div>
    </div>
  );
}
