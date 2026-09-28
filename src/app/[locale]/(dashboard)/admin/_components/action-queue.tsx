import { BellRing, CheckCircle2 } from "lucide-react";
import type { AdminQueueGroup, AdminQueueId, AdminQueueItem, AdminQueueLevel } from "@/lib/admin/actionQueue";
import { formatCount } from "@/lib/ui/intlFormat";
import { ActionQueueList } from "./action-queue-list";
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
 * Each row links to the list filtered to exactly the records it counts and
 * names its level and area in words; the area chips filter the list and keep
 * every area visible, including the ones with nothing waiting. This is the
 * only place these counts appear on the dashboard.
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
      {sorted.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-xs text-emerald-900 ring-1 ring-inset ring-emerald-100">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          {t("queue.allClearDetail")}
        </p>
      ) : (
        <ActionQueueList
          rows={sorted.map((item) => {
            const stem = ITEM_KEYS[item.id];
            return {
              id: item.id,
              group: item.group,
              level: item.level,
              href: `/${locale}${item.path}`,
              count: formatCount(item.count),
              title: t(`queue.items.${stem}`, { count: item.count }),
              groupLabel: t(`queue.groups.${item.group}`),
              levelLabel: t(`queue.levels.${item.level}`),
              detail: t(`queue.items.${stem}Detail`),
            };
          })}
          areas={groups.map((group: AdminQueueGroup) => ({
            group,
            label: t(`queue.groups.${group}`),
            count: items.filter((item) => item.group === group).length,
          }))}
          labels={{ all: t("queue.filterAll"), areas: t("queue.areasLabel"), groupClear: t("queue.groupClear") }}
        />
      )}
    </DashboardSection>
  );
}
