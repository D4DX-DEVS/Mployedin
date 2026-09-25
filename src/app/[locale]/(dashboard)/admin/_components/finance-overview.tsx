import Link from "next/link";
import { Ban, CalendarX2, Landmark } from "lucide-react";
import type { FinanceOverview, PaymentsMoney } from "@/lib/admin/dashboard/types";
import type { InvoiceStatusValue } from "@/lib/invoices/status";
import { formatCount } from "@/lib/ui/intlFormat";
import { DashboardCard, DashboardSection } from "./dashboard-section";
import { MetricTiles, shareOf } from "./stat-list";
import type { DashboardTranslator } from "./types";

const INVOICE_STATUS_KEYS: Record<InvoiceStatusValue, string> = {
  draft: "draft",
  pending_approval: "pendingApproval",
  issued: "issued",
  sent: "sent",
  paid: "paid",
  partially_paid: "partiallyPaid",
  overdue: "overdue",
  void: "void",
  cancelled: "cancelled",
  refunded: "refunded",
  credit_note: "creditNote",
};

const INVOICE_STATUS_DOTS: Partial<Record<InvoiceStatusValue, string>> = {
  pending_approval: "bg-amber-500",
  issued: "bg-sky-500",
  sent: "bg-sky-500",
  paid: "bg-emerald-500",
  partially_paid: "bg-teal-500",
  overdue: "bg-rose-500",
};

/**
 * Statuses already counted in Needs your action with a direct link to the same
 * filtered list. Showing the same count twice confused users ("is it 1 or 1?"),
 * so Finance shows only informational states — the queue owns the actionable ones.
 */
const QUEUE_OWNED_STATUSES: ReadonlySet<string> = new Set(["pending_approval", "overdue"]);

/** Payment and commission rows: which amount, and the list that holds exactly those records. */
const PAYMENT_ROWS: readonly { key: keyof Omit<PaymentsMoney, "currency">; path: string; tone?: string }[] = [
  { key: "awaitingVerification", path: "/admin/invoices?attention=payment_notice" },
  { key: "commissionPending", path: "/admin/commissions?status=pending" },
  { key: "commissionApproved", path: "/admin/commissions?status=approved" },
  { key: "commissionDisputed", path: "/admin/commissions?status=disputed", tone: "text-rose-800" },
  { key: "commissionPaid", path: "/admin/commissions?status=paid" },
];

interface Props {
  data: FinanceOverview;
  show: { invoices: boolean; subscriptions: boolean };
  days: number;
  locale: string;
  t: DashboardTranslator;
}

/** Whole units, compact ("AED 46.5K") so columns fit a phone; the exact figure is the title. */
function money(amount: number, currency: string, locale: string): { short: string; full: string } {
  try {
    return {
      short: new Intl.NumberFormat(locale, { style: "currency", currency, notation: "compact", minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(amount),
      full: new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount),
    };
  } catch {
    // An unknown ISO code must not take the dashboard down.
    const plain = `${currency} ${Math.round(amount).toLocaleString(locale)}`;
    return { short: plain, full: plain };
  }
}

function MoneyCell({ amount, currency, locale, className = "text-foreground" }: { amount: number; currency: string; locale: string; className?: string }) {
  const value = money(amount, currency, locale);
  return (
    <td className={`truncate px-1.5 py-1.5 text-end tabular-nums sm:px-2.5 ${amount > 0 ? className : "text-muted-foreground"}`} title={value.full}>
      {value.short}
    </td>
  );
}

/**
 * Money, invoice states, the subscription book, and what is owed to or by
 * agents. Every amount stays in its own currency — a platform total would add
 * AED to INR. Counts of things to act on (overdue, disputes, notices, pending
 * commissions, subscriptions ending) live in the action queue; this section
 * holds the amounts and distributions behind them.
 */
export function AdminFinanceOverview({ data, show, days, locale, t }: Props) {
  const invoiceRows = data.invoiceStatuses.filter((row) => row.count > 0 && !QUEUE_OWNED_STATUSES.has(row.status));
  const maxPlan = Math.max(1, ...data.plans.map((plan) => plan.count));
  const planGroups = (["employer", "job_seeker"] as const)
    .map((role) => ({ role, plans: data.plans.filter((plan) => plan.role === role) }))
    .filter((group) => group.plans.length > 0);
  const payments = data.payments;
  // A 5-row table of zeros (screenshot: AED 0 / ₹0 everywhere) is dead space — collapse to the empty state.
  const hasPaymentBalances =
    payments !== null && payments.some((row) => PAYMENT_ROWS.some((item) => row[item.key] > 0));
  // Invoices take the full row (balances beside states); subscriptions and
  // payments share the row below, or take it alone when the other is hidden.
  const pair = Number(show.subscriptions) + Number(Boolean(payments));
  const lower = pair === 1 ? "md:col-span-2" : "";

  return (
    <DashboardSection
      id="admin-finance"
      icon={Landmark}
      iconClassName="bg-amber-100 text-amber-900"
      title={t("finance.title")}
      description={t("finance.description")}
    >
      <div className="grid items-stretch gap-2.5 md:grid-cols-2">
        {show.invoices && (
          <DashboardCard
            title={t("money.title")}
            subtitle={t("money.description")}
            subtitleOnPhone={false}
            action={{ href: `/${locale}/admin/invoices`, label: t("finance.viewInvoices") }}
            className="md:col-span-2"
          >
            <div className="grid gap-2.5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-4">
            {data.money.length === 0 ? (
              <p className="rounded-lg bg-card/80 px-3 py-3 text-sm text-muted-foreground ring-1 ring-inset ring-border/60">{t("money.empty", { days })}</p>
            ) : (
              <div className="overflow-x-auto rounded-lg bg-card/80 ring-1 ring-inset ring-border/60">
                <table className="w-full table-fixed text-xs sm:text-sm" data-mobile-table="scroll">
                  <thead>
                    <tr className="border-b border-border/60 text-xs text-muted-foreground">
                      <th scope="col" className="w-12 px-1.5 py-1.5 text-start font-semibold sm:w-20 sm:px-2.5">
                        <span className="max-sm:sr-only">{t("money.currency")}</span>
                      </th>
                      <th scope="col" className="px-1.5 py-1.5 text-end font-semibold sm:px-2.5">{t("money.outstanding")}</th>
                      <th scope="col" className="px-1.5 py-1.5 text-end font-semibold sm:px-2.5">{t("money.overdue")}</th>
                      <th scope="col" className="px-1.5 py-1.5 text-end font-semibold sm:px-2.5">{t("money.collected", { days })}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.money.map((row) => (
                      <tr key={row.currency} className="border-b border-border/50 last:border-b-0" data-currency={row.currency}>
                        <th scope="row" className="px-1.5 py-2 text-start font-semibold text-foreground sm:px-2.5">{row.currency}</th>
                        <MoneyCell amount={row.outstanding} currency={row.currency} locale={locale} />
                        <MoneyCell amount={row.overdue} currency={row.currency} locale={locale} className="font-semibold text-rose-800" />
                        <MoneyCell amount={row.collected} currency={row.currency} locale={locale} />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div>
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-semibold text-foreground">{t("finance.invoicesTitle")}</h4>
                <span className="text-xs text-muted-foreground">{t("finance.invoicesSubtitle", { count: data.totalInvoices })}</span>
              </div>
              {invoiceRows.length === 0 ? (
                data.totalInvoices === 0 ? (
                  <p className="mt-1.5 text-xs text-muted-foreground">{t("finance.noInvoices")}</p>
                ) : null
              ) : (
                <ul className={invoiceRows.length <= 3 ? "mt-1.5 grid grid-cols-1 gap-1.5" : "mt-1.5 grid grid-cols-2 gap-1.5"}>
                  {invoiceRows.map((row) => {
                    const status = row.status as InvoiceStatusValue;
                    const share = shareOf(row.count, data.totalInvoices);
                    return (
                      <li key={row.status} data-invoice-status={row.status}>
                        <Link
                          href={`/${locale}/admin/invoices?status=${row.status}`}
                          className="flex min-h-11 items-center gap-2 rounded-lg bg-card/80 px-2.5 text-xs ring-1 ring-inset ring-border/60 transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:min-h-9"
                          title={share}
                        >
                          <span className={`h-2 w-2 shrink-0 rounded-full ${INVOICE_STATUS_DOTS[status] ?? "bg-slate-400"}`} aria-hidden="true" />
                          <span className="min-w-0 flex-1 truncate text-muted-foreground">{t(`invoiceStatuses.${INVOICE_STATUS_KEYS[status] ?? "unknown"}`)}</span>
                          <span className="font-semibold tabular-nums text-foreground">{formatCount(row.count)}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            </div>
          </DashboardCard>
        )}

        {show.subscriptions && (
          <DashboardCard
            title={t("finance.subscriptionsTitle")}
            subtitle={t("finance.subscriptionsSubtitle", { count: data.activeSubscriptions })}
            action={{ href: `/${locale}/admin/subscriptions`, label: t("finance.viewSubscriptions") }}
            className={lower}
          >
            {planGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("finance.noSubscriptions")}</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {planGroups.map((group) => (
                  <div key={group.role} data-plan-role={group.role}>
                    <h4 className="text-xs font-semibold text-muted-foreground">{t(`finance.planRole.${group.role === "employer" ? "employer" : "jobSeeker"}`)}</h4>
                    <ul className="mt-1 flex flex-col gap-1.5">
                      {group.plans.map((plan) => (
                        <li key={`${plan.role}-${plan.name}`} className="grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-3 text-xs">
                          <span className="truncate text-foreground">{plan.name}</span>
                          <span className="h-2 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
                            <span className="block h-full rounded-full bg-amber-500" style={{ width: `${Math.max(3, Math.round((plan.count / maxPlan) * 100))}%` }} />
                          </span>
                          <span className="min-w-6 text-end font-semibold tabular-nums text-foreground">{formatCount(plan.count)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-auto pt-3">
              <MetricTiles
                className="grid-cols-2"
                rows={[
                  { key: "subscriptions-expired", icon: CalendarX2, tone: "slate", value: data.expiredInPeriod, label: t("finance.expiredInPeriod", { days }) },
                  { key: "subscriptions-cancelled", icon: Ban, tone: "slate", value: data.cancelledInPeriod, label: t("finance.cancelledInPeriod", { days }) },
                ]}
              />
            </div>
          </DashboardCard>
        )}

        {payments && (
          <DashboardCard
            title={t("payments.title")}
            subtitle={t("payments.subtitle")}
            subtitleOnPhone={false}
            action={{ href: `/${locale}/admin/commissions`, label: t("payments.viewCommissions") }}
            className={lower}
          >
            {payments.length === 0 || !hasPaymentBalances ? (
              <p className="rounded-lg bg-card/80 px-3 py-3 text-sm text-muted-foreground ring-1 ring-inset ring-border/60">{t("payments.empty", { days })}</p>
            ) : (
              <div className="flex-1 overflow-x-auto rounded-lg bg-card/80 ring-1 ring-inset ring-border/60">
                <table className="h-full w-full table-fixed text-xs sm:text-sm" data-mobile-table="scroll">
                  <thead>
                    <tr className="border-b border-border/60 text-xs text-muted-foreground">
                      <th scope="col" className="w-[52%] px-2.5 py-1.5 text-start font-semibold">
                        <span className="sr-only">{t("payments.amount")}</span>
                      </th>
                      {payments.map((row) => (
                        <th key={row.currency} scope="col" className="px-2.5 py-1.5 text-end font-semibold">
                          {row.currency}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {PAYMENT_ROWS.map((row) => (
                      <tr key={row.key} className="border-b border-border/50 last:border-b-0" data-payment-row={row.key}>
                        <th scope="row" className="px-2.5 py-1.5 text-start font-normal">
                          <Link href={`/${locale}${row.path}`} className="text-foreground underline-offset-2 hover:text-primary hover:underline">
                            {t(`payments.${row.key}`, { days })}
                          </Link>
                        </th>
                        {payments.map((currency) => (
                          <MoneyCell key={currency.currency} amount={currency[row.key]} currency={currency.currency} locale={locale} className={row.tone ?? "text-foreground"} />
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DashboardCard>
        )}
      </div>
    </DashboardSection>
  );
}
