import Link from "next/link";
import type { LucideIcon } from "lucide-react";
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
 * `employer` has the same idea in PriorityActions; this is the super-agent's
 * version of it, with the severity encoded as a stripe as well as a word so it
 * survives being read in greyscale.
 */
export type PriorityLevel = "urgent" | "soon" | "review";

export interface PriorityItem {
  key: string;
  level: PriorityLevel;
  /** Translated name of the level — "Blocking", "Due", "Review". */
  levelLabel: string;
  /** Translated, already-pluralised sentence stating the count. */
  text: string;
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

const LEVEL_STYLES: Record<PriorityLevel, { stripe: string; chip: string; iconChip: string }> = {
  urgent: {
    stripe: "bg-rose-500",
    chip: "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-200",
    iconChip: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-200",
  },
  soon: {
    stripe: "bg-amber-500",
    chip: "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200",
    iconChip: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200",
  },
  review: {
    stripe: "bg-sky-500",
    chip: "bg-sky-100 text-sky-900 dark:bg-sky-950/60 dark:text-sky-200",
    iconChip: "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-200",
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
      className={cn("workspace-panel-surface overflow-hidden rounded-2xl", className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-2 px-4 pb-2 pt-3 sm:px-5 sm:pb-3 sm:pt-4">
        <div className="min-w-0">
          <h2 id={headingId} className="heading-label font-semibold tracking-tight text-foreground">
            {title}
          </h2>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground sm:text-sm">{description}</p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="border-t border-border/60 px-4 py-8 text-center sm:px-5">
          <p className="text-sm font-medium text-foreground">{emptyTitle}</p>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{emptyHint}</p>
        </div>
      ) : (
        <ul className="border-t border-border/60">
          {items.map((item) => {
            const styles = LEVEL_STYLES[item.level];
            const Icon = item.icon;
            return (
              <li key={item.key} className="border-b border-border/50 last:border-0">
                <Link
                  href={item.href}
                  className="group relative flex min-h-14 items-center gap-3 py-3 ps-5 pe-4 transition-colors hover:bg-primary/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500 sm:ps-6 sm:pe-5"
                >
                  <span
                    aria-hidden="true"
                    className={cn("absolute inset-y-0 start-0 w-1", styles.stripe)}
                  />
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                      styles.iconChip
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-semibold leading-5 text-foreground">
                        {item.text}
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          styles.chip
                        )}
                      >
                        {item.levelLabel}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {item.actionLabel}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className="shrink-0 text-lg leading-none text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-primary rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
                  >
                    ›
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
