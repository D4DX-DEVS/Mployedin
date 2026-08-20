import type { ReactNode } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface DashboardSectionProps {
  headingId: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

/**
 * Reusable dashboard section with one visual surface and a semantic heading.
 * Inner content should use rows/dividers instead of nesting another card grid.
 */
export function DashboardSection({
  headingId,
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
}: DashboardSectionProps) {
  return (
    <section
      aria-labelledby={headingId}
      className={cn("workspace-panel-surface overflow-hidden rounded-2xl", className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-2 pt-3 sm:px-5 sm:pb-3 sm:pt-4">
        <div className="min-w-0">
          <h2 id={headingId} className="text-sm font-semibold tracking-tight text-foreground sm:text-base">
            {title}
          </h2>
          {description && (
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground sm:text-sm">{description}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className={cn("border-t border-border/60", bodyClassName)}>{children}</div>
    </section>
  );
}

export interface DashboardSignal {
  label: string;
  value: ReactNode;
  href: string;
  icon: LucideIcon;
  supporting?: ReactNode;
  iconClassName?: string;
  ariaLabel?: string;
}

interface DashboardNextActionProps {
  headingId: string;
  title: string;
  description: string;
  actionTitle: string;
  actionDescription: string;
  actionLabel: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
  className?: string;
}

/** One explicit, role-aware next step. Keeps the dashboard from becoming a menu of equal choices. */
export function DashboardNextAction({
  headingId,
  title,
  description,
  actionTitle,
  actionDescription,
  actionLabel,
  href,
  icon: Icon,
  badge,
  className,
}: DashboardNextActionProps) {
  return (
    <section
      aria-labelledby={headingId}
      className={cn("workspace-panel-surface overflow-hidden rounded-2xl", className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-2 px-4 pb-2 pt-3 sm:px-5 sm:pb-3 sm:pt-4">
        <div className="min-w-0">
          <h2 id={headingId} className="text-sm font-semibold tracking-tight text-foreground sm:text-base">
            {title}
          </h2>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground sm:text-sm">{description}</p>
        </div>
        {badge && (
          <span className="rounded-full bg-sky-100 px-2 py-1 text-xs font-semibold text-sky-900 dark:bg-sky-900/60 dark:text-sky-100">
            {badge}
          </span>
        )}
      </div>
      <Link
        href={href}
        className="group mx-3 mb-3 flex min-h-14 items-center gap-3 rounded-xl bg-sky-600 px-3 py-3 text-white shadow-[0_14px_30px_-22px_rgba(2,132,199,0.9)] transition-colors hover:bg-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 sm:mx-4 sm:mb-4 sm:px-4"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold leading-5 sm:text-base">{actionTitle}</span>
          <span className="mt-0.5 block text-xs font-medium leading-5 text-sky-50 sm:text-sm">
            {actionDescription}
          </span>
        </span>
        <span className="hidden shrink-0 text-sm font-semibold sm:inline">{actionLabel}</span>
        <span aria-hidden="true" className="text-xl leading-none transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5">›</span>
      </Link>
    </section>
  );
}

interface DashboardSignalStripProps {
  headingId: string;
  title: string;
  signals: readonly DashboardSignal[];
  className?: string;
}

/** A compact, comparison-first metric strip for phone, tablet, and desktop. */
export function DashboardSignalStrip({
  headingId,
  title,
  signals,
  className,
}: DashboardSignalStripProps) {
  return (
    <section
      aria-labelledby={headingId}
      className={cn("workspace-panel-surface overflow-hidden rounded-2xl", className)}
    >
      <h2
        id={headingId}
        className="border-b border-border/60 px-4 py-2.5 text-sm font-semibold tracking-tight text-foreground sm:px-5"
      >
        {title}
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-4">
        {signals.map((signal, index) => {
          const Icon = signal.icon;
          return (
            <Link
              key={`${signal.label}-${index}`}
              href={signal.href}
              aria-label={signal.ariaLabel}
              className={cn(
                "group min-w-0 px-3 py-3 text-start transition-colors hover:bg-primary/[0.035] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500 sm:px-4",
                index % 2 === 1 && "border-s border-border/60",
                index >= 2 && "border-t border-border/60 md:border-t-0",
                index > 0 && "md:border-s md:border-border/60"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 text-xs font-medium leading-4 text-muted-foreground sm:text-sm">
                  {signal.label}
                </span>
                <Icon className={cn("h-4 w-4 shrink-0", signal.iconClassName)} aria-hidden="true" />
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-foreground">
                {signal.value}
              </div>
              {signal.supporting && (
                <div className="mt-0.5 hidden line-clamp-2 text-xs leading-4 text-muted-foreground lg:block">
                  {signal.supporting}
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
