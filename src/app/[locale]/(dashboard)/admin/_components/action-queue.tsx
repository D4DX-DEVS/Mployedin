import Link from "next/link";
import { AlertTriangle, ArrowRight, BellRing, CalendarClock, CheckCircle2, Clock3 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
export const LEVEL_STYLES: Record<AdminQueueLevel, { icon: LucideIcon; pill: string; tile: string }> = {
  critical: { icon: AlertTriangle, pill: "bg-rose-100 text-rose-800 ring-rose-200", tile: "ring-rose-200 bg-rose-50/60" },
  warning: { icon: Clock3, pill: "bg-amber-100 text-amber-900 ring-amber-200", tile: "ring-border/70 bg-card" },
  upcoming: { icon: CalendarClock, pill: "bg-sky-100 text-sky-800 ring-sky-200", tile: "ring-border/70 bg-card" },
};

const LEVELS: readonly AdminQueueLevel[] = ["critical", "warning", "upcoming"];

/** Span for the last tile: the rest of its row at two columns (md) and at three (xl). */
function lastTileSpan(count: number): string {
  const md = count % 2 === 1 ? "md:col-span-2" : "";
  const xl = count % 3 === 1 ? "xl:col-span-3" : count % 3 === 2 ? "xl:col-span-2" : md ? "xl:col-span-1" : "";
  return `${md} ${xl}`;
}

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
  const sorted = [...items].sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level));

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
        <ul className="flex flex-wrap gap-1.5 max-sm:hidden" aria-label={t("queue.legendLabel")}>
          {LEVELS.map((level) => (
            <li key={level} className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${LEVEL_STYLES[level].pill}`}>
              {t(`queue.levels.${level}`)}
            </li>
          ))}
        </ul>
      </div>

      {sorted.length === 0 ? (
        <p className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-xs text-emerald-900 ring-1 ring-inset ring-emerald-100">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          {t("queue.allClearDetail")}
        </p>
      ) : (
        <ul className="mt-3 grid gap-1.5 sm:gap-2 md:grid-cols-2 xl:grid-cols-3">
          {sorted.map((item, index) => {
            const stem = ITEM_KEYS[item.id];
            const level = LEVEL_STYLES[item.level];
            const LevelIcon = level.icon;
            return (
              <li key={item.id} className={index === sorted.length - 1 ? lastTileSpan(sorted.length) : undefined}>
                <Link
                  href={`/${locale}${item.path}`}
                  className={`group flex h-full min-h-11 items-center gap-2.5 rounded-lg px-2.5 py-1.5 ring-1 ring-inset transition-colors hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:min-h-16 sm:py-2 ${level.tile}`}
                  data-queue-id={item.id}
                  data-level={item.level}
                >
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset sm:h-8 sm:w-8 ${level.pill}`}>
                    <LevelIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={2.25} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    {/* Phones show one line per item; the level and area stay audible. */}
                    <span className="sm:hidden">
                      <span className="sr-only">
                        {t(`queue.levels.${item.level}`)}, {t(`queue.groups.${item.group}`)}:{" "}
                      </span>
                    </span>
                    <span className="line-clamp-2 block text-[13px] font-medium leading-4 text-foreground sm:line-clamp-none sm:text-sm sm:leading-5">
                      <span className="me-1 font-semibold tabular-nums">{formatCount(item.count)}</span>
                      {t(`queue.items.${stem}`, { count: item.count })}
                    </span>
                    <span className="mt-1 hidden text-xs leading-5 text-muted-foreground sm:block">
                      <span className={`me-1.5 inline-block rounded-full px-2 py-px text-xs font-semibold ring-1 ring-inset ${level.pill}`}>
                        {t(`queue.levels.${item.level}`)}
                      </span>
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
