import type { ReactNode } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export interface ReportKpi {
  key: string;
  label: string;
  value: string;
  /** A shorter value for the four-across phone strip, e.g. a compact amount. */
  phoneValue?: string;
  /** One line under the value saying what the number holds. */
  detail: string;
  /** Pinned to the card's foot (a change badge, a progress bar). */
  footer?: ReactNode;
  note?: string | null;
  dot: string;
  tone: string;
  icon: LucideIcon;
  /** The list the number comes from; omitted when no list filters to it. */
  href?: string;
}

/**
 * The four totals at the top of a report tab. Phones get a four-across strip
 * like the employer headers — value over label — and the detail line, footer
 * and note are held back for wider screens.
 */
export function ReportKpiGrid({ kpis, ariaLabel }: { kpis: ReportKpi[]; ariaLabel: string }) {
  return (
    <section className="grid grid-cols-4 gap-1.5 sm:grid-cols-2 sm:gap-3 xl:grid-cols-4" aria-label={ariaLabel}>
      {kpis.map((kpi) => {
        const body = (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-1 flex-col items-center sm:block">
                <p className="order-2 line-clamp-2 text-[10px] font-semibold leading-tight text-muted-foreground sm:text-xs">
                  <span className={`me-1.5 hidden h-2 w-2 rounded-full align-middle sm:inline-block ${kpi.dot}`} />
                  {kpi.label}
                </p>
                <p className="order-1 text-base font-semibold tracking-tight text-foreground sm:mt-2 sm:text-2xl">
                  {kpi.phoneValue ? (
                    <>
                      <span className="sm:hidden">{kpi.phoneValue}</span>
                      <span className="hidden sm:inline">{kpi.value}</span>
                    </>
                  ) : kpi.value}
                </p>
              </div>
              <div className={`hidden rounded-xl p-2 sm:block ${kpi.tone}`}>
                <kpi.icon className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 hidden text-xs leading-5 text-muted-foreground sm:block">{kpi.detail}</p>
            {/* Pinned to the foot so the four footers line up even when one
                detail line wraps. */}
            {kpi.footer ? <div className="hidden items-center gap-2 sm:mt-auto sm:flex sm:pt-2">{kpi.footer}</div> : null}
            {kpi.note ? <p className="mt-1.5 hidden text-xs text-muted-foreground sm:block">{kpi.note}</p> : null}
          </>
        );
        const className = "workspace-panel-surface rounded-xl p-2 text-center sm:flex sm:flex-col sm:rounded-2xl sm:text-start sm:card-pad";

        return kpi.href ? (
          <Link key={kpi.key} href={kpi.href} className={`${className} transition-shadow hover:ring-2 hover:ring-primary/20 hover:shadow-md`}>
            {body}
          </Link>
        ) : (
          <div key={kpi.key} className={className}>{body}</div>
        );
      })}
    </section>
  );
}
