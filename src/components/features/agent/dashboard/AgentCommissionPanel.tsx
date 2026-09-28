import { AlertTriangle, BadgeCheck, Clock, Wallet } from "lucide-react";
import { Panel, StatRows, type StatRow } from "@/components/shared/DashboardKit";
import { COMMISSION_BUCKETS, type CommissionBucket, type CommissionBucketTotal } from "@/lib/agents/dashboardShapes";
import { formatCurrency } from "@/lib/currency";
import type { AgentTranslator } from "./types";

export interface AgentCommissionData {
  buckets: Record<CommissionBucket, CommissionBucketTotal>;
  currency: string;
  /** "?dateFrom=…&dateTo=…" for this month, as the commissions page reads it. */
  monthQuery: string;
  monthLabel: string;
}

interface Props {
  data: AgentCommissionData;
  locale: string;
  t: AgentTranslator;
}

const TONE: Record<CommissionBucket, StatRow["tone"]> = {
  pending: "warning",
  approved: "info",
  paid: "good",
  disputed: "critical",
};

const ICON: Record<CommissionBucket, StatRow["icon"]> = {
  pending: Clock,
  approved: BadgeCheck,
  paid: Wallet,
  disputed: AlertTriangle,
};

/** This month's commission by status; each row opens the commissions page filtered to it. */
export function AgentCommissionPanel({ data, locale, t }: Props) {
  const rows: StatRow[] = COMMISSION_BUCKETS.map((bucket) => ({
    key: bucket,
    label: t(`commission.${bucket}`, { count: data.buckets[bucket].count }),
    value: formatCurrency(data.buckets[bucket].amount, data.currency),
    tone: TONE[bucket],
    icon: ICON[bucket],
    href: `/${locale}/agent/commissions?status=${bucket}&${data.monthQuery}`,
  }));
  const total = COMMISSION_BUCKETS.reduce((sum, bucket) => sum + data.buckets[bucket].count, 0);
  return (
    <Panel
      id="agent-commission"
      icon={Wallet}
      iconClassName="bg-emerald-100 text-emerald-800"
      title={t("commission.title")}
      subtitle={t("commission.subtitle", { month: data.monthLabel })}
      action={{ href: `/${locale}/agent/commissions?${data.monthQuery}`, label: t("commission.viewAll") }}
    >
      {total === 0 ? (
        <p className="flex flex-1 items-center justify-center py-8 text-center text-sm text-muted-foreground">{t("commission.empty")}</p>
      ) : (
        <StatRows rows={rows} />
      )}
    </Panel>
  );
}
