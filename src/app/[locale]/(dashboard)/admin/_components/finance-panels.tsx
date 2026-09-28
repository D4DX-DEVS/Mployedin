import { CreditCard, Landmark, ReceiptText } from "lucide-react";
import { BarList, DonutChart, Panel, TrendChart, type BarListRow, type DonutSlice, type TrendPoint } from "@/components/shared/DashboardKit";
import type { MonthlyRevenue } from "@/lib/admin/dashboard/trends.server";
import type { FinanceOverview } from "@/lib/admin/dashboard/types";
import { formatCurrency } from "@/lib/currency";
import { formatCount } from "@/lib/ui/intlFormat";
import type { DashboardTranslator } from "./types";

const INVOICE_STATUS_KEYS: Record<string, string> = {
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

const INVOICE_STATUS_COLORS: Record<string, string> = {
  paid: "#008300",
  partially_paid: "#1baf7a",
  issued: "#0242CE",
  sent: "#5598e7",
  pending_approval: "#eda100",
  draft: "#94a3b8",
  overdue: "#e34948",
  void: "#cbd5e1",
  cancelled: "#cbd5e1",
  refunded: "#eb6834",
  credit_note: "#4a3aa7",
};

interface RevenueProps {
  revenue: readonly MonthlyRevenue[];
  currency: string | null;
  now: Date;
  locale: string;
  t: DashboardTranslator;
}

/** Collected payments per month for the last twelve months, in the busiest currency. */
export function RevenuePanel({ revenue, currency, now, locale, t }: RevenueProps) {
  const fmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-u-nu-latn" : "en-GB", { month: "short" });
  const byMonth = new Map(revenue.filter((r) => r.currency === currency).map((r) => [r.month, r.collected]));
  const points: TrendPoint[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = d.toISOString().slice(0, 7);
    points.push({ label: fmt.format(d), collected: byMonth.get(key) ?? 0 });
  }
  const total = points.reduce((sum, p) => sum + Number(p.collected), 0);
  const code = currency ?? "AED";
  return (
    <Panel
      id="admin-revenue"
      icon={Landmark}
      iconClassName="bg-emerald-100 text-emerald-800"
      title={t("revenue.title")}
      subtitle={t("revenue.description", { currency: code })}
      action={{ href: `/${locale}/admin/invoices`, label: t("finance.viewInvoices") }}
      aside={<span className="text-sm font-semibold tabular-nums text-foreground">{formatCurrency(total, code, "code")}</span>}
    >
      <TrendChart
        series={[{ key: "collected", label: t("revenue.collected"), color: "#1baf7a" }]}
        points={points}
        emptyLabel={t("revenue.empty")}
        height={220}
        format={{ kind: "currency", currency: code }}
      />
    </Panel>
  );
}

interface FinanceProps {
  data: FinanceOverview;
  show: { invoices: boolean; subscriptions: boolean };
  days: number;
  locale: string;
  t: DashboardTranslator;
}

export function InvoicesPanel({ data, locale, t }: FinanceProps) {
  const slices: DonutSlice[] = data.invoiceStatuses
    .filter((row) => row.count > 0)
    .map((row) => ({
      key: row.status,
      label: t(`invoiceStatuses.${INVOICE_STATUS_KEYS[row.status] ?? "unknown"}`),
      value: row.count,
      color: INVOICE_STATUS_COLORS[row.status],
      href: `/${locale}/admin/invoices?status=${row.status}`,
    }));
  const money = data.money[0];
  return (
    <Panel
      id="admin-invoices"
      icon={ReceiptText}
      iconClassName="bg-amber-100 text-amber-900"
      title={t("finance.invoicesTitle")}
      subtitle={t("finance.invoicesSubtitle", { count: data.totalInvoices })}
      action={{ href: `/${locale}/admin/invoices`, label: t("finance.viewInvoices") }}
      bodyClassName="gap-3"
    >
      <DonutChart slices={slices} totalLabel={t("kpi.total")} emptyLabel={t("finance.noInvoices")} />
      {money && (
        <dl className="grid grid-cols-2 gap-2 border-t border-border/60 pt-3 text-xs">
          <div>
            <dt className="text-muted-foreground">{t("money.outstanding")}</dt>
            <dd className="mt-0.5 font-semibold tabular-nums text-foreground">{formatCurrency(money.outstanding, money.currency, "code")}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("money.overdue")}</dt>
            <dd className={`mt-0.5 font-semibold tabular-nums ${money.overdue > 0 ? "text-rose-700" : "text-foreground"}`}>{formatCurrency(money.overdue, money.currency, "code")}</dd>
          </div>
        </dl>
      )}
    </Panel>
  );
}

export function SubscriptionsPanel({ data, days, locale, t }: FinanceProps) {
  const rows: BarListRow[] = data.plans.map((plan) => ({
    key: `${plan.role}-${plan.name}`,
    label: `${plan.name || "—"} · ${t(`finance.planRole.${plan.role === "employer" ? "employer" : "jobSeeker"}`)}`,
    value: plan.count,
    href: `/${locale}/admin/subscriptions?role=${plan.role}`,
    color: plan.role === "employer" ? "#0242CE" : "#eb6834",
  }));
  return (
    <Panel
      id="admin-subscriptions"
      icon={CreditCard}
      title={t("finance.subscriptionsTitle")}
      subtitle={t("finance.subscriptionsSubtitle", { count: data.activeSubscriptions })}
      action={{ href: `/${locale}/admin/subscription-dashboard`, label: t("finance.viewSubscriptions") }}
      bodyClassName="justify-between gap-3"
    >
      <BarList rows={rows} emptyLabel={t("finance.noSubscriptions")} />
      <dl className="grid grid-cols-2 gap-2 border-t border-border/60 pt-3 text-xs">
        <div>
          <dt className="text-muted-foreground">{t("finance.expiredInPeriod", { days })}</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-foreground">{formatCount(data.expiredInPeriod)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("finance.cancelledInPeriod", { days })}</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-foreground">{formatCount(data.cancelledInPeriod)}</dd>
        </div>
      </dl>
    </Panel>
  );
}
