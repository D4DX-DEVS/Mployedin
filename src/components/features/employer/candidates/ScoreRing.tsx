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
  /** Plain-language band name ("Strong match"). Announced to screen readers so
   *  the band is never communicated by ring colour alone (WCAG 1.4.1). */
  bandLabel?: string;
  className?: string;
}

type Band = "strong" | "moderate" | "low";

function scoreBand(value: number): Band {
  if (value >= 80) return "strong";
  if (value >= 60) return "moderate";
  return "low";
}

/**
 * Plain-language name for a score band, for the `bandLabel` prop.
 * Pass a translator scoped to `employerCompliance.match`.
 */
export function matchBandLabel(
  value: number | undefined,
  t: (key: string) => string
): string | undefined {
  if (value == null) return undefined;
  return t(scoreBand(value));
}

/** Colour plus a distinct dash pattern, so the band survives greyscale. */
const BAND_STYLE: Record<Band, { stroke: string; dashPattern?: string }> = {
  strong: { stroke: "#047857" },
  moderate: { stroke: "#b45309", dashPattern: "6 3" },
  low: { stroke: "#be123c", dashPattern: "2 3" },
};

/**
 * Lightweight SVG donut used to surface the AI match score as the focal point
 * of candidate cards and the detail panel. Pure presentational, no deps.
 */
export function ScoreRing({
  value,
  size = 56,
  strokeWidth = 5,
  label,
  emptyLabel = "—",
  bandLabel,
  className,
}: ScoreRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = value != null ? Math.max(0, Math.min(100, value)) : 0;
  const dash = (clamped / 100) * circumference;
  const band = value != null ? scoreBand(value) : null;
  const style = band ? BAND_STYLE[band] : null;
  const caption = label ?? bandLabel;

  // The ring is sized in rem, not px, so it grows with the user's browser text
  // size along with the numerals inside it. `size` stays a px-valued prop so
  // every existing caller keeps working unchanged.
  const remSize = `${size / 16}rem`;

  return (
    <div
      className={`relative inline-flex shrink-0 items-center justify-center ${className ?? ""}`}
      style={{ width: remSize, height: remSize, fontSize: remSize }}
    >
      <svg viewBox={`0 0 ${size} ${size}`} width="100%" height="100%" className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-slate-200"
        />
        {value != null && style ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={style.stroke}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference - dash}`}
          />
        ) : null}
        {/* Second, inset arc carrying the band's dash pattern. Colour alone
            cannot distinguish the bands for a colour-blind or greyscale user. */}
        {value != null && style?.dashPattern ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={Math.max(1, radius - strokeWidth)}
            fill="none"
            stroke={style.stroke}
            strokeWidth={1.5}
            strokeDasharray={style.dashPattern}
            opacity={0.85}
          />
        ) : null}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-none">
        {value != null ? (
          <>
            {/* em-based so the number grows with the user's text-size setting
                instead of staying pinned at a hard pixel value. */}
            <span className="font-bold text-foreground" style={{ fontSize: "0.26em" }}>
              {Math.round(value)}%
            </span>
            {caption ? (
              <span
                className="mt-0.5 max-w-full truncate px-0.5 font-medium text-muted-foreground"
                style={{ fontSize: "0.15em" }}
              >
                {caption}
              </span>
            ) : null}
          </>
        ) : (
          <span className="font-semibold text-muted-foreground" style={{ fontSize: "0.22em" }}>
            {emptyLabel}
          </span>
        )}
      </div>
      {/* The band in words, for screen readers and anyone who cannot rely on
          the ring colour. */}
      {value != null && bandLabel ? <span className="sr-only">{bandLabel}</span> : null}
    </div>
  );
}
