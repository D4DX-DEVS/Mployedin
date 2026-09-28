import { AlertTriangle, BadgeCheck, Clock, Wallet } from "lucide-react";
import { Panel, StatRows, type StatRow } from "@/components/shared/DashboardKit";
import { formatCurrency } from "@/lib/currency";
import type { SuperAgentCommissions } from "@/lib/superAgent/dashboardData";
import type { SuperAgentHref, SuperAgentTranslator } from "./types";

interface Props {
  commissions: SuperAgentCommissions;
  href: SuperAgentHref;
  t: SuperAgentTranslator;
}

/** The SA's commissions by where they sit: waiting on approval, approved, paid this month, disputed. */
export function CommissionPanel({ commissions, href, t }: Props) {
  const money = (amount: number) => formatCurrency(amount, commissions.currency, "code");
  const rows: StatRow[] = [
    { key: "pending", label: t("commission.pending", { count: commissions.pending.count }), value: money(commissions.pending.amount), tone: "warning", icon: Clock, href: href("/commissions?status=pending") },
    { key: "approved", label: t("commission.approved", { count: commissions.approved.count }), value: money(commissions.approved.amount), tone: "info", icon: BadgeCheck, href: href("/commissions?status=approved") },
    { key: "paid", label: t("commission.paidThisMonth", { count: commissions.paidThisMonth.count }), value: money(commissions.paidThisMonth.amount), tone: "good", icon: Wallet, href: href("/commissions?status=paid") },
    { key: "disputed", label: t("commission.disputed", { count: commissions.disputed.count }), value: money(commissions.disputed.amount), tone: commissions.disputed.count > 0 ? "critical" : "neutral", icon: AlertTriangle, href: href("/commissions?status=disputed") },
  ];
  return (
    <Panel
      id="super-agent-commissions"
      icon={Wallet}
      iconClassName="bg-emerald-100 text-emerald-800"
      title={t("commission.title")}
      subtitle={t("commission.description", { currency: commissions.currency })}
      action={{ href: href("/commissions"), label: t("commission.viewAll") }}
    >
      <StatRows rows={rows} />
    </Panel>
  );
}
