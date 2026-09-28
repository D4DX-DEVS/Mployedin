import Link from "next/link";
import { ArrowRight, BellRing, CheckCircle2 } from "lucide-react";
import { Panel } from "@/components/shared/DashboardKit";
import type { AdminQueueGroup, AdminQueueId, AdminQueueItem, AdminQueueLevel } from "@/lib/admin/actionQueue";
import { formatCount } from "@/lib/ui/intlFormat";
import type { DashboardTranslator } from "./types";

/** Message key stem per queue id; `<stem>` labels the count, `<stem>Detail` is the scope line. */
export const ITEM_KEYS: Record<AdminQueueId, string> = {
  "exhibitions-submitted": "exhibitionsSubmitted",
  "exhibitions-under-review": "exhibitionsUnderReview",
  "exhibitions-budget": "exhibitionsBudget",
  "invoices-pending-approval": "invoicesPendingApproval",
  "commissions-pending": "commissionsPending",
  "company-reviews-pending": "companyReviewsPending",
  "default-plans-missing": "defaultPlansMissing",
  "gdpr-pending": "gdprPending",
  "invoices-overdue": "invoicesOverdue",
  "payment-notices": "paymentNotices",
  "invoice-disputes": "invoiceDisputes",
  "commissions-disputed": "commissionsDisputed",
  "subscriptions-ending": "subscriptionsEnding",
  "support-tickets": "supportTickets",
  "contact-unread": "contactUnread",
  "applications-awaiting-review": "applicationsAwaitingReview",
  "jobs-without-applications": "jobsWithoutApplications",
};

const GROUP_DOTS: Record<AdminQueueGroup, string> = {
  decisions: "bg-rose-500",
  finance: "bg-amber-500",
  compliance: "bg-sky-500",
  recruitment: "bg-violet-500",
};

const LEVEL_BADGE: Record<AdminQueueLevel, string> = {
  critical: "bg-rose-100 text-rose-800 ring-rose-200",
  warning: "bg-amber-100 text-amber-900 ring-amber-200",
  upcoming: "bg-muted text-muted-foreground ring-border",
};

const LEVELS: readonly AdminQueueLevel[] = ["critical", "warning", "upcoming"];

/** Stable tie-breaker inside a severity: privacy and money exceptions lead. */
const PRIORITY: Partial<Record<AdminQueueId, number>> = {
  "gdpr-pending": 0,
  "invoices-overdue": 1,
  "exhibitions-under-review": 2,
  "invoice-disputes": 3,
  "commissions-disputed": 4,
  "default-plans-missing": 5,
  "invoices-pending-approval": 6,
  "commissions-pending": 7,
  "payment-notices": 8,
  "applications-awaiting-review": 9,
  "jobs-without-applications": 10,
};

export function sortQueue(items: readonly AdminQueueItem[]): AdminQueueItem[] {
  return [...items].sort(
    (a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level) || (PRIORITY[a.id] ?? Number.MAX_SAFE_INTEGER) - (PRIORITY[b.id] ?? Number.MAX_SAFE_INTEGER),
  );
}

interface Props {
  items: readonly AdminQueueItem[];
  groups: readonly AdminQueueGroup[];
  locale: string;
  t: DashboardTranslator;
}

/**
 * Decisions, exceptions and issues waiting on an admin, most urgent first.
 * Every row links to the list filtered to exactly the records it counts.
 */
export function AttentionPanel({ items, groups, locale, t }: Props) {
  const sorted = sortQueue(items);
  return (
    <Panel
      id="admin-action-queue"
      icon={BellRing}
      iconClassName={sorted.length ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"}
      title={t("queue.title")}
      subtitle={sorted.length ? t("queue.itemsNeedAction", { count: sorted.length }) : t("queue.allClear")}
      bodyClassName="gap-3"
    >
      <ul className="flex flex-wrap gap-1.5" aria-label={t("queue.areasLabel")}>
        {groups.map((group) => {
          const count = items.filter((item) => item.group === group).length;
          return (
            <li key={group} data-queue-group={group} className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-foreground">
              <span className={`h-1.5 w-1.5 rounded-full ${GROUP_DOTS[group]}`} aria-hidden="true" />
              {t(`queue.groups.${group}`)}
              {count === 0 ? <CheckCircle2 className="h-3 w-3 text-emerald-700" aria-label={t("queue.groupClear")} /> : <span className="font-semibold tabular-nums">{count}</span>}
            </li>
          );
        })}
      </ul>
      {sorted.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-xs text-emerald-900 ring-1 ring-inset ring-emerald-100">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          {t("queue.allClearDetail")}
        </p>
      ) : (
        <ul className="-mx-1 max-h-[27rem] divide-y divide-border/60 overflow-y-auto px-1">
          {sorted.map((item) => {
            const stem = ITEM_KEYS[item.id];
            return (
              <li key={item.id}>
                <Link
                  href={`/${locale}${item.path}`}
                  data-queue-id={item.id}
                  data-level={item.level}
                  className="group flex items-center gap-2.5 py-2 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                >
                  <span className={`flex h-8 min-w-8 shrink-0 items-center justify-center rounded-lg px-1.5 text-xs font-bold tabular-nums ring-1 ring-inset ${LEVEL_BADGE[item.level]}`}>
                    {formatCount(item.count)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold leading-4 text-foreground">{t(`queue.items.${stem}`, { count: item.count })}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      <span className="sr-only">{t(`queue.levels.${item.level}`)} · </span>
                      {t(`queue.groups.${item.group}`)} · {t(`queue.items.${stem}Detail`)}
                    </span>
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:rotate-180" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
