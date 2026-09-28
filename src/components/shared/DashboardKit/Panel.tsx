import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface PanelProps {
  id?: string;
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  /** Tint of the icon badge, e.g. "bg-primary/10 text-primary". */
  iconClassName?: string;
  action?: { href: string; label: string };
  /** Right-aligned content in the header row, before the action link. */
  aside?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

/**
 * One dashboard panel: compact header (icon, title, one-line purpose, optional
 * "view all") and a body. Full height so panels in one grid row line up.
 */
export function Panel({ id, title, subtitle, icon: Icon, iconClassName = "bg-primary/10 text-primary", action, aside, className = "", bodyClassName = "", children }: PanelProps) {
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <section
      aria-labelledby={headingId}
      id={id}
      className={`workspace-panel-surface flex h-full min-w-0 flex-col rounded-2xl p-4 ${className}`}
      data-surface="light-panel"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {Icon && (
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconClassName}`}>
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
          )}
          <div className="min-w-0">
            <h2 id={headingId} className="text-[15px] font-semibold leading-5 tracking-tight text-foreground">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-xs leading-4 text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        {(aside || action) && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-1">
            {aside}
            {action && (
              <Link
                href={action.href}
                className="inline-flex min-h-8 items-center gap-1 text-xs font-semibold text-primary transition-colors hover:text-primary/80"
              >
                {action.label}
                <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
              </Link>
            )}
          </div>
        )}
      </div>
      <div className={`mt-3 flex min-h-0 flex-1 flex-col ${bodyClassName}`}>{children}</div>
    </section>
  );
}
