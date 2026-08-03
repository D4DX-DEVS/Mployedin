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
  eyebrow: string;
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
}: DashboardPageHeaderProps) {
  const Heading = headingLevel === 2 ? "h2" : "h1";
  return (
    <section
      data-dashboard-page-header="component"
      className={cn(
        "dashboard-page-header workspace-hero-surface overflow-hidden rounded-2xl px-4 py-3 sm:px-5 sm:py-4",
        className
      )}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 max-w-3xl">
          <div className="hidden items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary sm:flex">
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{eyebrow}</span>
          </div>
          <Heading className="text-xl font-semibold tracking-tight text-foreground sm:mt-1.5 sm:text-[1.625rem]">
            {title}
          </Heading>
          {description && (
            <p className="mt-1 line-clamp-2 max-w-2xl text-xs leading-4 text-muted-foreground sm:text-sm sm:leading-5">
              {description}
            </p>
          )}
        </div>

        {(summary || actions) && (
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 sm:gap-3 lg:flex-nowrap lg:shrink-0">
            {summary && (
              <div className="workspace-glass-panel min-w-0 border-s-2 border-primary/30 ps-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {summary.label}
                </p>
                <p className="mt-0.5 text-sm font-semibold leading-5 text-foreground sm:text-lg sm:leading-6">{summary.value}</p>
                {summary.note && (
                  <p className="hidden truncate text-xs text-muted-foreground sm:block">{summary.note}</p>
                )}
              </div>
            )}
            {actions && (
              <div className="flex min-w-0 flex-wrap items-center gap-2 [&>*]:shrink-0">
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
            // Always one row, even on phones — value/label text shrinks instead,
            // so 4-5 stats don't stack into a tall multi-row block.
            metrics.length === 1 && "grid-cols-1",
            metrics.length === 2 && "grid-cols-2",
            metrics.length === 3 && "grid-cols-3",
            metrics.length === 4 && "grid-cols-4",
            metrics.length >= 5 && "grid-cols-5",
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
                  "border-e border-border/60 last:border-e-0",
                  metric.onClick && "transition-colors hover:bg-background/45",
                  metric.active && "bg-primary/5 ring-1 ring-inset ring-primary/30"
                )}
              >
                <div className="min-w-0">
                  {/* Word-wrap instead of truncate on label + value: long labels like
                      "Total Applications" rendered as "Total Applica…" on phones, which said nothing. */}
                  <p className="line-clamp-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {metric.label}
                  </p>
                  <div className="mt-1 flex min-w-0 items-baseline gap-2">
                    <p className="line-clamp-2 text-sm font-semibold leading-tight tracking-tight text-foreground sm:text-2xl sm:leading-none">
                      {metric.value}
                    </p>
                    {metric.note && (
                      <p className="hidden truncate text-xs text-muted-foreground sm:block">
                        {metric.note}
                      </p>
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
