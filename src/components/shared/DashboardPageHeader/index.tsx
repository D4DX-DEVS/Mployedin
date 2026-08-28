import type { ReactNode } from "react";
import { Sparkles, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DashboardHeaderMetric {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  icon: LucideIcon;
  iconClassName?: string;
  iconSurfaceClassName?: string;
  onClick?: () => void;
  active?: boolean;
}

interface DashboardPageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: LucideIcon;
  summary?: {
    label: string;
    value: ReactNode;
    note?: ReactNode;
  };
  actions?: ReactNode;
  metrics?: readonly DashboardHeaderMetric[];
  metricsClassName?: string;
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
  headingLevel?: 1 | 2;
  /** Keep title and actions on one row at every width. Only for headers with
   *  a single short action — several buttons squeeze the title on a phone. */
  inlineActions?: boolean;
  /** Phones: drop the explanatory description and the nested summary card. */
  compactOnMobile?: boolean;
  /** Phones only: title and actions share one row and a 4-metric strip runs
   *  4-across instead of 2x2. Measured on employer/candidates, this takes the
   *  header from 231px to ~150px — most of a list card back above the fold.
   *  Opt-in per page: a header with long metric labels or several wide actions
   *  should stay on the default two-row layout. No effect from `sm` up. */
  compact?: boolean;
}

/**
 * Compact, flat dashboard page heading. It keeps identity, platform summary,
 * actions, metrics, filters and optional expanded content in one visual segment.
 */
export function DashboardPageHeader({
  eyebrow,
  title,
  description,
  icon: Icon = Sparkles,
  summary,
  actions,
  metrics,
  metricsClassName,
  footer,
  children,
  className,
  headingLevel = 1,
  inlineActions = false,
  compactOnMobile = false,
  compact = false,
}: DashboardPageHeaderProps) {
  const Heading = headingLevel === 2 ? "h2" : "h1";
  return (
    <section
      data-dashboard-page-header="component"
      data-compact={compact ? "true" : undefined}
      className={cn(
        "dashboard-page-header workspace-hero-surface overflow-hidden rounded-2xl px-4 py-3 sm:px-5 sm:py-4",
        compact && "px-3 py-2.5 sm:px-5 sm:py-4",
        className
      )}
    >
      <div className={cn(
        "flex gap-3 lg:flex-row lg:items-end lg:justify-between",
        inlineActions ? "flex-row items-start justify-between" : "flex-col",
        compact && "flex-row items-center justify-between gap-2 sm:gap-3"
      )}>
        <div className="min-w-0 max-w-3xl">
          {eyebrow && (
            <div className="hidden items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary sm:flex">
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{eyebrow}</span>
            </div>
          )}
          <Heading className={cn(
            "text-xl font-semibold tracking-tight text-foreground sm:mt-1.5 sm:text-[1.625rem]",
            // Sharing the row with the actions leaves ~165px on a 390px screen,
            // so the title steps down to 16px there — at 20px "Candidate
            // Matching" broke into "Can / dida / te". Full size from sm.
            compact && "text-base leading-snug sm:text-[1.625rem]"
          )}>
            {title}
          </Heading>
          {description && (
            <p className={cn(
              "mt-1 max-w-2xl text-xs leading-5 text-muted-foreground sm:text-sm",
              compactOnMobile && "hidden sm:block"
            )}>
              {description}
            </p>
          )}
        </div>

        {(summary || actions) && (
          <div className="flex min-w-0 shrink-0 flex-wrap items-center justify-between gap-2 sm:gap-3 lg:flex-nowrap">
            {summary && (
              <div className={cn(
                "workspace-glass-panel min-w-0 border-s-2 border-primary/30 ps-3",
                compactOnMobile && "hidden sm:block"
              )}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {summary.label}
                </p>
                <div className="mt-0.5 text-sm font-semibold leading-5 text-foreground sm:text-lg sm:leading-6">{summary.value}</div>
                {summary.note && (
                  <div className="hidden truncate text-xs text-muted-foreground sm:block">{summary.note}</div>
                )}
              </div>
            )}
            {actions && (
              <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2 [&>*]:shrink-0">
                {actions}
              </div>
            )}
          </div>
        )}
      </div>

      {metrics && metrics.length > 0 && (
        <div
          className={cn(
            "mt-3 grid border-y border-border/60 sm:mt-4",
            metrics.length === 1 && "grid-cols-1",
            metrics.length === 2 && "grid-cols-2",
            metrics.length === 3 && "grid-cols-2 sm:grid-cols-3",
            metrics.length === 4 && (compact ? "grid-cols-4" : "grid-cols-2 md:grid-cols-4"),
            metrics.length >= 5 && "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
            metricsClassName
          )}
        >
          {metrics.map((metric, index) => {
            const MetricIcon = metric.icon;
            const MetricContainer = metric.onClick ? "button" : "div";
            return (
              <MetricContainer
                key={`${metric.label}-${index}`}
                {...(metric.onClick ? { type: "button" as const, onClick: metric.onClick } : {})}
                className={cn(
                  "flex min-w-0 items-center justify-between gap-1 px-1 py-2 text-start sm:gap-2 sm:px-3 sm:py-2.5",
                  // Compact phones: value over label, centred, so four cells fit
                  // an ~83px column without the label wrapping.
                  compact && "justify-center px-0.5 py-1.5 text-center sm:justify-between sm:px-3 sm:py-2.5 sm:text-start",
                  "border-e border-border/60 last:border-e-0",
                  metric.onClick && "transition-colors hover:bg-background/45",
                  metric.active && "bg-primary/5 ring-1 ring-inset ring-primary/30"
                )}
              >
                <div className={cn("min-w-0", compact && "flex flex-col items-center sm:block")}>
                  {/* Word-wrap instead of truncate on label + value: long labels like
                      "Total Applications" rendered as "Total Applica…" on phones, which said nothing. */}
                  <p className={cn(
                    "line-clamp-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground",
                    // Label reads under the value on compact phones, and loses the
                    // 0.14em tracking that would push it past an 83px column.
                    compact && "order-2 tracking-normal sm:order-none sm:tracking-[0.14em]"
                  )}>
                    {metric.label}
                  </p>
                  <div className={cn(
                    "mt-1 flex min-w-0 items-baseline gap-2",
                    compact && "order-1 mt-0 justify-center sm:order-none sm:mt-1 sm:justify-start"
                  )}>
                    {/* The value is a number — it must never wrap. line-clamp-2 here
                        broke "10" into "1" / "0" once the note squeezed the cell.
                        The note absorbs the squeeze by truncating instead. */}
                    <div className={cn(
                      "shrink-0 whitespace-nowrap text-sm font-semibold leading-tight tracking-tight text-foreground sm:text-2xl sm:leading-none",
                      compact && "text-lg sm:text-2xl"
                    )}>
                      {metric.value}
                    </div>
                    {metric.note && (
                      <div className="hidden min-w-0 truncate text-xs text-muted-foreground sm:block">
                        {metric.note}
                      </div>
                    )}
                  </div>
                </div>
                <span
                  className={cn(
                    "me-1 hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:flex",
                    metric.iconSurfaceClassName
                  )}
                >
                  <MetricIcon className={cn("h-4 w-4", metric.iconClassName)} aria-hidden="true" />
                </span>
              </MetricContainer>
            );
          })}
        </div>
      )}

      {footer && (
        <div className="mt-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
          {footer}
        </div>
      )}

      {children && <div>{children}</div>}
    </section>
  );
}
