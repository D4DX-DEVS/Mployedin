import Link from "next/link";
import { Filter } from "lucide-react";
import { BarList, Panel, type BarListRow } from "@/components/shared/DashboardKit";
import type { LeadStage } from "@/lib/agents/dashboardShapes";
import { formatCount } from "@/lib/ui/intlFormat";
import type { AgentTranslator } from "./types";

export interface AgentLeadFunnelData {
  stages: Record<LeadStage, number>;
  /** Every lead the agent owns, any status. */
  total: number;
  converted: number;
}

interface Props {
  data: AgentLeadFunnelData;
  locale: string;
  t: AgentTranslator;
}

const FUNNEL_ORDER: readonly Exclude<LeadStage, "lost">[] = ["new", "contacted", "interested", "negotiating", "converted"];

/** Employer leads by stage, new to converted, each bar the filtered pipeline view. */
export function AgentLeadFunnel({ data, locale, t }: Props) {
  const rows: BarListRow[] = FUNNEL_ORDER.map((stage) => ({
    key: stage,
    label: t(`leadFunnel.stages.${stage}`),
    value: data.stages[stage],
    valueLabel: formatCount(data.stages[stage]),
    note: data.total > 0 ? `${Math.round((data.stages[stage] / data.total) * 100)}%` : undefined,
    href: `/${locale}/agent/leads?status=${stage}`,
  }));
  const open = data.total - data.converted - data.stages.lost;
  return (
    <Panel
      id="agent-lead-funnel"
      icon={Filter}
      iconClassName="bg-violet-100 text-violet-800"
      title={t("leadFunnel.title")}
      subtitle={t("leadFunnel.subtitle", { total: data.total, converted: data.converted })}
      action={{ href: `/${locale}/agent/leads`, label: t("leadFunnel.viewAll") }}
      bodyClassName="justify-between gap-4"
    >
      {data.total === 0 ? (
        <p className="flex flex-1 items-center justify-center py-8 text-center text-sm text-muted-foreground">{t("leadFunnel.empty")}</p>
      ) : (
        <BarList rows={rows} max={Math.max(1, ...rows.map((r) => r.value))} tone="ramp" />
      )}
      <dl className="grid grid-cols-2 gap-2 border-t border-border/60 pt-3 text-xs">
        <div>
          <dt className="text-muted-foreground">{t("leadFunnel.open")}</dt>
          <dd className="mt-0.5 text-base font-semibold tabular-nums text-foreground">{formatCount(Math.max(0, open))}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("leadFunnel.stages.lost")}</dt>
          <dd className="mt-0.5 text-base font-semibold tabular-nums text-foreground">
            <Link href={`/${locale}/agent/leads?status=lost`} className="hover:underline">
              {formatCount(data.stages.lost)}
            </Link>
          </dd>
        </div>
      </dl>
    </Panel>
  );
}
