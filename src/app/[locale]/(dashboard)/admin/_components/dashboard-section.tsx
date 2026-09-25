import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * A section's panel from `sm` up. On phones the section is flat — heading, then
 * its cards straight on the page — so there is no panel padding around card
 * padding. (The surface class sits in `@layer components`; these utilities win.)
 */
export const SECTION_PANEL =
  "workspace-panel-surface rounded-2xl max-sm:rounded-none max-sm:border-0 max-sm:bg-transparent max-sm:p-0 max-sm:shadow-none sm:p-4";

interface DashboardSectionProps {
  id: string;
  icon: LucideIcon;
  /** Tint of the icon badge, e.g. "bg-rose-100 text-rose-700". */
  iconClassName: string;
  title: string;
  description?: string;
  action?: { href: string; label: string };
  /** Right-aligned content in the header row, before the action link. */
  aside?: ReactNode;
  children: ReactNode;
}

/** One dashboard band: badge, title, one-line purpose, optional "view all". */
export function DashboardSection({ id, icon: Icon, iconClassName, title, description, action, aside, children }: DashboardSectionProps) {
  return (
    <section aria-labelledby={id} className={SECTION_PANEL} data-surface="light-panel">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
        <div className="flex min-w-0 items-center gap-2.5 [flex-wrap:nowrap]">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconClassName}`}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id={id} className="heading-section font-semibold tracking-tight text-foreground">
              {title}
            </h2>
            {description && <p className="hidden text-xs leading-4 text-muted-foreground sm:block">{description}</p>}
          </div>
        </div>
        {(aside || action) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {aside}
            {action && (
              <Link
                href={action.href}
                className="inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-primary transition-colors hover:text-primary/80"
              >
                {action.label}
                <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
              </Link>
            )}
          </div>
        )}
      </div>
      <div className="mt-2.5 sm:mt-3">{children}</div>
    </section>
  );
}

/**
 * Card columns for a section: one on phones, two on tablets, up to `max` on
 * wide screens. An odd card left alone in the last row spans it, so a card the
 * admin may not read never leaves a hole.
 */
export function cardGrid(count: number, max: 2 | 3 = 3): { grid: string; cell: (index: number) => string } {
  if (max === 3 && count === 3) {
    return { grid: "md:grid-cols-2 xl:grid-cols-3", cell: (index) => (index === 2 ? "md:col-span-2 xl:col-span-1" : "") };
  }
  if (count <= 1) return { grid: "", cell: () => "" };
  return { grid: "md:grid-cols-2", cell: (index) => (count % 2 === 1 && index === count - 1 ? "md:col-span-2" : "") };
}

interface DashboardCardProps {
  title: string;
  subtitle?: string;
  /** False for an explanatory subtitle that phones can do without; counts stay. */
  subtitleOnPhone?: boolean;
  action?: { href: string; label: string };
  className?: string;
  children: ReactNode;
}

/** A card inside a section. Full height so cards in one grid row line up. */
export function DashboardCard({ title, subtitle, subtitleOnPhone = true, action, className = "", children }: DashboardCardProps) {
  return (
    <div className={`workspace-subtle-surface flex h-full min-w-0 flex-col rounded-xl p-3 shadow-[0_8px_24px_-20px_rgba(15,23,42,0.35)] ${className}`} data-surface="light-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {subtitle && <p className={`text-xs text-muted-foreground ${subtitleOnPhone ? "" : "hidden sm:block"}`}>{subtitle}</p>}
        </div>
        {action && (
          <Link
            href={action.href}
            className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary transition-colors hover:text-primary/80"
          >
            {action.label}
            <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
          </Link>
        )}
      </div>
      <div className="mt-2 flex flex-1 flex-col">{children}</div>
    </div>
  );
}
