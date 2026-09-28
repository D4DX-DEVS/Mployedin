import { formatDate } from "@/lib/ui/intlFormat";

export interface TrendSeries {
  key: string;
  color: string;
  /** Dashed and without dots: a plan line (a target) rather than a measured one. */
  dashed?: boolean;
}

export interface TrendPoint {
  /** ISO year-month, e.g. "2026-04". */
  month: string;
  values: Record<string, number>;
}

/* Drawn in a fixed viewBox and scaled by the container. 360 wide keeps the
   axis and month labels legible on a 390px phone (≈0.9 scale) instead of
   shrinking a desktop-sized drawing to two thirds. */
const CHART_W = 360;
const CHART_H = 190;
const PAD_X = 30;
const PAD_Y = 26;
/** Above this many points every other month is labelled, so labels never touch. */
const MAX_LABELS = 8;

/**
 * Top of the scale, rounded up so the four gridlines land on round numbers
 * (10/20/30/40, not 10/19/29/38). Counts never get a step under 1.
 */
function niceMax(max: number, integers: boolean): number {
  const rawStep = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const niceStep = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10) * magnitude;
  return (integers ? Math.max(1, Math.ceil(niceStep)) : niceStep) * 4;
}

/* "2026-04" -> "Apr 26" / "أبريل 26", read as UTC so no timezone shifts the
   month. A single-year series drops the year: it is in the card's title. */
function formatMonth(month: string, locale: string, withYear: boolean) {
  return formatDate(
    `${month}-01T00:00:00Z`,
    withYear ? { month: "short", year: "2-digit", timeZone: "UTC" } : { month: "short", timeZone: "UTC" },
    locale,
  );
}

/** Monthly series on one shared baseline, e.g. jobs vs applications or target vs achieved. */
export function TrendLineChart({ series, points, locale, ariaLabel, formatTick = (value) => String(Math.round(value)) }: {
  series: TrendSeries[];
  points: TrendPoint[];
  locale: string;
  ariaLabel: string;
  formatTick?: (value: number) => string;
}) {
  const values = points.flatMap((point) => series.map((line) => point.values[line.key] ?? 0));
  const max = niceMax(Math.max(1, ...values), values.every(Number.isInteger));
  const innerW = CHART_W - PAD_X * 2;
  const innerH = CHART_H - PAD_Y * 2;
  const xFor = (index: number) => (points.length > 1 ? PAD_X + (index * innerW) / (points.length - 1) : CHART_W / 2);
  const yFor = (value: number) => CHART_H - PAD_Y - (value / max) * innerH;
  const path = (key: string) => points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${xFor(index).toFixed(1)} ${yFor(point.values[key] ?? 0).toFixed(1)}`)
    .join(" ");
  const oneYear = new Set(points.map((point) => point.month.slice(0, 4))).size === 1;
  const labelStep = points.length > MAX_LABELS ? 2 : 1;

  return (
    <svg
      viewBox={`0 0 ${CHART_W} ${CHART_H}`}
      role="img"
      aria-label={ariaLabel}
      /* The geometry is left-to-right in both locales; under RTL the axis
         numbers anchored at x=2 ran off the left edge. */
      className="w-full text-muted-foreground [direction:ltr]"
      preserveAspectRatio="xMidYMid meet"
    >
      {[0.25, 0.5, 0.75, 1].map((tick) => {
        const y = CHART_H - PAD_Y - innerH * tick;
        return (
          <g key={tick}>
            <line x1={PAD_X} y1={y} x2={CHART_W - PAD_X} y2={y} stroke="rgba(71,85,105,0.28)" strokeDasharray="4 6" />
            <text x={2} y={y + 3.5} fill="currentColor" className="fill-current text-[10px]">
              {formatTick(max * tick)}
            </text>
          </g>
        );
      })}
      {series.map((line) => (
        <path
          key={line.key}
          d={path(line.key)}
          fill="none"
          stroke={line.color}
          strokeWidth={line.dashed ? 2 : 2.5}
          strokeDasharray={line.dashed ? "5 5" : undefined}
          strokeLinecap="round"
        />
      ))}
      {points.map((point, index) => (
        <g key={point.month}>
          {series.filter((line) => !line.dashed).map((line) => (
            <circle key={line.key} cx={xFor(index)} cy={yFor(point.values[line.key] ?? 0)} r="3.5" fill={line.color} />
          ))}
          {index % labelStep === 0 ? (
            <text x={xFor(index)} y={CHART_H - 6} textAnchor="middle" fill="currentColor" className="fill-current text-[10px]">
              {formatMonth(point.month, locale, !oneYear)}
            </text>
          ) : null}
        </g>
      ))}
    </svg>
  );
}
