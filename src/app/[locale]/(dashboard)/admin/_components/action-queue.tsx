import Link from "next/link";
import { ArrowRight, BellRing, CheckCircle2 } from "lucide-react";
import type { AdminQueueGroup, AdminQueueId, AdminQueueItem, AdminQueueLevel } from "@/lib/admin/actionQueue";
import { formatCount } from "@/lib/ui/intlFormat";
import { DashboardSection } from "./dashboard-section";
import type { DashboardTranslator } from "./types";

/** Message key stem per queue id; `<stem>` labels the count, `<stem>Detail` is the scope line. */
const ITEM_KEYS: Record<AdminQueueId, string> = {
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

/** Dark text on a light tint of the same hue, so every pill passes contrast. */
const LEVELS: readonly AdminQueueLevel[] = ["critical", "warning", "upcoming"];

/** Stable tie-breaker inside a severity: privacy and money exceptions lead. */
const PRIORITY: Partial<Record<AdminQueueId, number>> = {
  "gdpr-pending": 0,
  "invoices-overdue": 1,
  // Review decisions sit immediately after overdue invoices in the queue;
  // payment notices and recruitment follow once the urgent decisions are clear.
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

interface AdminActionQueueProps {
  items: readonly AdminQueueItem[];
  /** Groups the admin can read; the rest are hidden, not shown as empty. */
  groups: readonly AdminQueueGroup[];
  locale: string;
  t: DashboardTranslator;
}

/**
 * Decisions, exceptions and operational issues as one list, most urgent first.
 * Each tile links to the list filtered to exactly the records it counts and
 * names its level and area in words; the area row keeps every area visible,
 * including the ones with nothing waiting. This is the only place these counts
 * appear on the dashboard.
 */
export function AdminActionQueue({ items, groups, locale, t }: AdminActionQueueProps) {
  const sorted = [...items].sort(
    (a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level) || (PRIORITY[a.id] ?? Number.MAX_SAFE_INTEGER) - (PRIORITY[b.id] ?? Number.MAX_SAFE_INTEGER),
  );

  return (
    <DashboardSection
      id="admin-action-queue"
      icon={BellRing}
      iconClassName="bg-rose-100 text-rose-800"
      title={t("queue.title")}
      description={t("queue.description")}
      aside={
        items.length > 0 ? (
          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800">
            <span className="sm:hidden">{t("queue.itemsCount", { count: items.length })}</span>
            <span className="max-sm:hidden">{t("queue.itemsNeedAction", { count: items.length })}</span>
          </span>
        ) : (
          <span className="text-xs font-semibold text-emerald-800">{t("queue.allClear")}</span>
        )
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <ul
          className="-mx-1 flex flex-wrap gap-1.5 px-1 max-sm:w-[calc(100%+0.5rem)] max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:pb-0.5"
          aria-label={t("queue.areasLabel")}
        >
          {groups.map((group) => {
            const count = items.filter((item) => item.group === group).length;
            return (
              <li
                key={group}
                className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-foreground"
                data-queue-group={group}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${GROUP_DOTS[group]}`} aria-hidden="true" />
                {t(`queue.groups.${group}`)}
                {count === 0 ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" aria-label={t("queue.groupClear")} />
                ) : (
                  <span className="font-semibold tabular-nums">{count}</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {sorted.length === 0 ? (
        <p className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-xs text-emerald-900 ring-1 ring-inset ring-emerald-100">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          {t("queue.allClearDetail")}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border/70 rounded-xl bg-card ring-1 ring-inset ring-border/60">
          {sorted.map((item, index) => {
            const stem = ITEM_KEYS[item.id];
            const title = t(`queue.items.${stem}`, { count: item.count });
            return (
              <li
                key={item.id}
                // Preserve the legacy grid hook for consumers that style the
                // final item while the compact queue uses a single list.
                className={sorted.length === 4 && index === sorted.length - 1 ? "xl:col-span-3" : undefined}
              >
                <Link
                  href={`/${locale}${item.path}`}
                  className="group flex min-w-0 items-center gap-3 px-3 py-3 transition-colors hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:px-4"
                  data-queue-id={item.id}
                  data-level={item.level}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <span className="text-xs font-bold tabular-nums">{formatCount(item.count)}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold leading-5 text-foreground">{title}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      <span className="sr-only">{t(`queue.levels.${item.level}`)}</span>
                      <span className="font-medium text-foreground/80">{t(`queue.groups.${item.group}`)}</span> · {t(`queue.items.${stem}Detail`)}
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:rotate-180" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </DashboardSection>
  );
}
