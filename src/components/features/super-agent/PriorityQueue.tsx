import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * What is waiting on this super-agent, ranked.
 *
 * The dashboard already had a single "recommended next" card, but it was
 * derived from ratios (are there more leads than employers?) rather than from
 * work anyone is actually blocked on — so the one queue only a super-agent can
 * clear, exhibition requests, was invisible until they remembered to open it.
 * Each row states the count, names the action and links to the list already
 * filtered to exactly those records.
 *
 * Severity is encoded three ways — stripe, tint and a WORDED pill — so it
 * survives greyscale and a quick scan. The pills used to be 11px pastel chips
 * that read as metadata; they are now 24px, bold and high-contrast, one fixed
 * style per level: Blocking (solid rose), Due (solid amber), Review (sky).
 */
export type PriorityLevel = "urgent" | "soon" | "review";

export interface PriorityItem {
  key: string;
  level: PriorityLevel;
  /** Translated name of the level — "Blocking", "Due", "Review". */
  levelLabel: string;
  count: number;
  /** Translated, pluralised sentence WITHOUT the number: "Exhibition requests await your review". */
  title: string;
  /** One line on what the rows are: "Submitted by your agents for approval". */
  hint: string;
  /** Where the row goes: "Review requests". */
  actionLabel: string;
  href: string;
  icon: LucideIcon;
}

interface SuperAgentPriorityQueueProps {
  headingId: string;
  title: string;
  description: string;
  items: readonly PriorityItem[];
  emptyTitle: string;
  emptyHint: string;
  className?: string;
}

const LEVEL_STYLES: Record<PriorityLevel, { stripe: string; row: string; iconChip: string; pill: string }> = {
  urgent: {
    stripe: "bg-rose-600",
    row: "bg-rose-50/70 hover:bg-rose-50",
    iconChip: "bg-rose-100 text-rose-700",
    pill: "bg-rose-600 text-white",
  },
  soon: {
    stripe: "bg-amber-500",
    row: "bg-amber-50/70 hover:bg-amber-50",
    iconChip: "bg-amber-100 text-amber-800",
    pill: "bg-amber-400 text-amber-950",
  },
  review: {
    stripe: "bg-sky-600",
    row: "bg-sky-50/60 hover:bg-sky-50",
    iconChip: "bg-sky-100 text-sky-700",
    pill: "bg-sky-100 text-sky-900 ring-1 ring-inset ring-sky-300",
  },
};

export function SuperAgentPriorityQueue({
  headingId,
  title,
  description,
  items,
  emptyTitle,
  emptyHint,
  className,
}: SuperAgentPriorityQueueProps) {
  return (
    <section
      aria-labelledby={headingId}
      className={cn("workspace-panel-surface flex flex-col overflow-hidden rounded-2xl", className)}
    >
      <div className="px-4 pb-2 pt-3 sm:px-5 sm:pt-4">
        <h2 id={headingId} className="heading-label font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        <p className="mt-0.5 hidden text-xs leading-5 text-muted-foreground sm:block">{description}</p>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center border-t border-border/60 px-4 py-8 text-center sm:px-5">
          <p className="text-sm font-medium text-foreground">{emptyTitle}</p>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{emptyHint}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2 px-3 pb-3 sm:px-4 sm:pb-4">
          {items.map((item) => {
            const styles = LEVEL_STYLES[item.level];
            const Icon = item.icon;
            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  data-priority-level={item.level}
                  className={cn(
                    "group relative flex min-h-14 items-center gap-3 overflow-hidden rounded-xl py-2.5 ps-4 pe-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 sm:ps-5",
                    styles.row,
                  )}
                >
                  <span aria-hidden="true" className={cn("absolute inset-y-0 start-0 w-1", styles.stripe)} />
                  <span
                    aria-hidden="true"
                    className={cn("hidden size-9 shrink-0 items-center justify-center rounded-lg sm:flex", styles.iconChip)}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="w-8 shrink-0 text-center text-xl font-semibold tabular-nums text-foreground">
                    {item.count}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold leading-5 text-foreground">{item.title}</span>
                    <span className="block truncate text-xs leading-5 text-muted-foreground">{item.hint}</span>
                  </span>
                  <span
                    className={cn(
                      "inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-[11px] font-bold uppercase tracking-[0.06em]",
                      styles.pill,
                    )}
                  >
                    {item.levelLabel}
                  </span>
                  <span className="hidden shrink-0 text-xs font-medium text-muted-foreground xl:inline">
                    {item.actionLabel}
                  </span>
                  <span className="sr-only xl:hidden">{item.actionLabel}</span>
                  <ChevronRight
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground/70 transition-transform group-hover:translate-x-0.5 group-hover:text-primary rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
