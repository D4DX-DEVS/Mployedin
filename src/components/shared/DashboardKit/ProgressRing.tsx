export interface ProgressRingProps {
  /** Percent complete; values above 100 fill the ring and are printed as given. */
  value: number;
  /** Pre-formatted centre text; defaults to "{value}%". */
  valueLabel?: string;
  /** Small caption under the centre text. */
  label: string;
  /** Outer diameter in px. */
  size?: number;
  strokeWidth?: number;
  /** Ring colour; defaults to the brand blue. */
  color?: string;
  className?: string;
}

/**
 * A single completion ring — "42% of this month's target" — drawn as plain
 * SVG so it renders from server and client components alike.
 */
export function ProgressRing({ value, valueLabel, label, size = 128, strokeWidth = 10, color = "#0242CE", className = "" }: ProgressRingProps) {
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = Math.min(safe, 100) / 100;
  const dash = circumference * filled;
  return (
    <div
      role="img"
      aria-label={`${label}: ${valueLabel ?? `${Math.round(safe)}%`}`}
      className={`relative shrink-0 ${className}`}
      style={{ width: size, height: size }}
      data-progress-ring
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth={strokeWidth} />
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
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-2 text-center">
        <span className="text-xl font-semibold tabular-nums leading-none tracking-tight text-foreground">{valueLabel ?? `${Math.round(safe)}%`}</span>
        <span className="mt-1 max-w-full truncate text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}
