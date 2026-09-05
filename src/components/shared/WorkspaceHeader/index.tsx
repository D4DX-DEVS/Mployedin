import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface WorkspaceMetric {
  /** Short label under/beside the value. Rendered as a 12px uppercase caption. */
  label: string;
  /** Even shorter label for the phone strip (four cells share ~330px). */
  shortLabel?: string;
  /** API-wide total. Never a count of the current page. */
  value: ReactNode;
  /** Desktop only. Hidden on phones so four cells fit one row. */
  icon?: LucideIcon;
  /** Tint of the icon tile on desktop. Defaults to primary. */
  tone?: "primary" | "success" | "info" | "warning";
  /** Makes the metric a toggle (e.g. filter the list by this status). */
  onClick?: () => void;
  /** Pressed state of a clickable metric. */
  active?: boolean;
}

interface WorkspaceHeaderProps {
  /** Page title. A ReactNode so a page can swap in a shorter title on phones. */
  title: ReactNode;
  /** One short context line under the title — the scope or benchmark, not a
   *  description of the page. Clamped to a single line at every width, so a
   *  long string costs nothing in height but is read truncated: keep it short
   *  enough to fit ~45 characters on a 390px phone. */
  context?: ReactNode;
  /** Live status shown after the context ("Refreshing…"). Announced politely. */
  status?: ReactNode;
  /** Actions on the title row. Primary last. On phones they share the row
   *  while they fit and wrap beneath the title when they do not — the title
   *  itself is never squeezed. */
  actions?: ReactNode;
  /** Three or four totals in a slim strip under the title row. */
  metrics?: readonly WorkspaceMetric[];
  headingLevel?: 1 | 2;
  className?: string;
}

/**
 * Compact workspace header for operational list pages (Pattern A from the
 * 2026-09-04 UI audit): title row + optional metric strip on one slim panel
 * surface. Filters, search and export do NOT live here — they belong to the
 * list toolbar directly above the list.
 *
 * Height budget: ≤ 72px without metrics, ≤ 136px with, at every width.
 * Styles: `.workspace-header*` in globals.css (mobile-first).
 */
export function WorkspaceHeader({
  title,
  context,
  status,
  actions,
  metrics,
  headingLevel = 1,
  className,
}: WorkspaceHeaderProps) {
  const Heading = headingLevel === 2 ? "h2" : "h1";
  const hasMetrics = Boolean(metrics && metrics.length > 0);
  const interactive = Boolean(metrics?.some((m) => m.onClick));

  return (
    <section data-workspace-header="" className={cn("workspace-header", className)}>
      <div className="workspace-header-row">
        <div className="workspace-header-text">
          <Heading className="workspace-header-title text-balance">{title}</Heading>
          {(context || status) && (
            <p className="workspace-header-context">
              {context && <span className="min-w-0 flex-1 basis-0 line-clamp-1">{context}</span>}
              {status && (
                <span className="workspace-header-status shrink-0" aria-live="polite">
                  {status}
                </span>
              )}
            </p>
          )}
        </div>
        {actions && <div className="workspace-header-actions">{actions}</div>}
      </div>

      {hasMetrics && (
        <div
          className="workspace-header-metrics"
          role={interactive ? "group" : undefined}
          style={{ "--metric-count": metrics!.length } as CSSProperties}
        >
          {metrics!.map((metric) => {
            const Icon = metric.icon;
            const body = (
              <>
                <span className="workspace-header-metric-value tabular-nums">{metric.value}</span>
                <span className="workspace-header-metric-label">
                  {metric.shortLabel ? (
                    <>
                      <span className="sm:hidden">{metric.shortLabel}</span>
                      <span className="hidden sm:inline">{metric.label}</span>
                    </>
                  ) : metric.label}
                </span>
                {Icon && <Icon className="workspace-header-metric-icon" aria-hidden="true" />}
              </>
            );
            if (metric.onClick) {
              return (
                <button
                  key={metric.label}
                  type="button"
                  aria-pressed={Boolean(metric.active)}
                  onClick={metric.onClick}
                  className={cn("workspace-header-metric is-clickable", metric.active && "is-active")}
                  data-tone={metric.tone ?? "primary"}
                >
                  {body}
                </button>
              );
            }
            return (
              <div key={metric.label} className="workspace-header-metric" data-tone={metric.tone ?? "primary"}>
                {body}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
