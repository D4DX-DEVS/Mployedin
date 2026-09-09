"use client";

interface ScoreRingProps {
  /** Match score 0-100. When undefined the ring renders an empty/idle state. */
  value?: number;
  /** Outer diameter in pixels. */
  size?: number;
  /** Ring thickness in pixels. */
  strokeWidth?: number;
  /** Small caption rendered under the ring (e.g. "AI Match"). Sits outside the
   *  donut, so it is never squeezed into the hole and never crosses the stroke. */
  label?: string;
  /** Text shown when no score is available yet. */
  emptyLabel?: string;
  /** Plain-language band name ("Strong match"). Announced to screen readers so
   *  the band is never communicated by ring colour alone (WCAG 1.4.1). Callers
   *  that want it on screen render it themselves next to the ring — it is never
   *  drawn inside the donut, where it would land at 6-7px and overlap the arc. */
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
  // The ring is sized in rem, not px, so it grows with the user's browser text
  // size along with the numerals inside it. `size` stays a px-valued prop so
  // every existing caller keeps working unchanged.
  const remSize = `${size / 16}rem`;

  const donut = (
    <div
      className="relative inline-flex shrink-0 items-center justify-center"
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
      {/* Only the number lives in the hole. A word alongside it used to render
          at 0.15em — 6.6px on the 44px card ring — and ran over the stroke. */}
      <div className="absolute inset-0 flex items-center justify-center text-center leading-none">
        {value != null ? (
          <>
            {/* em-based so the number grows with the user's text-size setting
                instead of staying pinned at a hard pixel value. */}
            <span className="font-bold text-foreground" style={{ fontSize: "0.3em" }}>
              {Math.round(value)}%
            </span>
          </>
        ) : (
          <span className="font-semibold text-muted-foreground" style={{ fontSize: "0.24em" }}>
            {emptyLabel}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div className={`inline-flex shrink-0 flex-col items-center gap-0.5 ${className ?? ""}`}>
      {donut}
      {/* Caption sits under the donut at a fixed, readable size rather than
          scaling with `size` — at 0.15em it was unreadable on every caller. */}
      {label ? (
        <span className="whitespace-nowrap text-[11px] font-medium leading-tight text-muted-foreground">
          {label}
        </span>
      ) : null}
      {/* The band in words, for screen readers and anyone who cannot rely on
          the ring colour. */}
      {value != null && bandLabel ? <span className="sr-only">{bandLabel}</span> : null}
    </div>
  );
}

/** Tailwind tone for the band word when a caller renders it beside the ring. */
export function matchBandTone(value: number | undefined): string {
  if (value == null) return "text-muted-foreground";
  const band = scoreBand(value);
  if (band === "strong") return "text-emerald-700";
  if (band === "moderate") return "text-amber-700";
  return "text-rose-700";
}
