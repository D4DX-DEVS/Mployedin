import Link from "next/link";
import { ArrowRight, BellRing, CheckCircle2 } from "lucide-react";
import { Panel } from "@/components/shared/DashboardKit";
import { formatCount } from "@/lib/ui/intlFormat";

export type PriorityLevel = "urgent" | "soon" | "review";

/** One queue row: plain data so the section can build it from counts. */
export interface PriorityItem {
  key: string;
  level: PriorityLevel;
  /** Translated name of the level — "Blocking", "Due", "Review". */
  levelLabel: string;
  count: number;
  /** Translated, pluralised sentence WITHOUT the number: "Exhibition requests await your review". */
  title: string;
  /** One line on what the rows are and where the row goes. */
  hint: string;
  href: string;
}

const LEVEL_BADGE: Record<PriorityLevel, string> = {
  urgent: "bg-rose-100 text-rose-800 ring-rose-200",
  soon: "bg-amber-100 text-amber-900 ring-amber-200",
  review: "bg-sky-100 text-sky-900 ring-sky-200",
};

interface Props {
  id: string;
  items: readonly PriorityItem[];
  title: string;
  subtitle: string;
  emptyTitle: string;
  emptyHint: string;
}

/**
 * What is waiting on this super-agent, most blocking first. Each row states
 * the count and links to the list already filtered to exactly those records;
 * the level is carried by colour AND a worded label so it survives greyscale.
 */
export function PriorityQueuePanel({ id, items, title, subtitle, emptyTitle, emptyHint }: Props) {
  const clear = items.length === 0;
  return (
    <Panel
      id={id}
      icon={BellRing}
      iconClassName={clear ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}
      title={title}
      subtitle={subtitle}
    >
      {clear ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 rounded-lg bg-emerald-50 px-3 py-6 text-center ring-1 ring-inset ring-emerald-100">
          <CheckCircle2 className="h-5 w-5 text-emerald-700" aria-hidden="true" />
          <p className="text-sm font-medium text-emerald-900">{emptyTitle}</p>
          <p className="text-xs text-emerald-800/80">{emptyHint}</p>
        </div>
      ) : (
        <ul className="-mx-1 divide-y divide-border/60 px-1">
          {items.map((item) => (
            <li key={item.key}>
              <Link
                href={item.href}
                data-priority-level={item.level}
                className="group flex items-center gap-2.5 py-2 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
              >
                <span className={`flex h-8 min-w-8 shrink-0 items-center justify-center rounded-lg px-1.5 text-xs font-bold tabular-nums ring-1 ring-inset ${LEVEL_BADGE[item.level]}`}>
                  {formatCount(item.count)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold leading-4 text-foreground">{item.title}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    <span className="font-medium">{item.levelLabel}</span> · {item.hint}
                  </span>
                </span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:rotate-180" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
