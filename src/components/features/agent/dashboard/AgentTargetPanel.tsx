import Link from "next/link";
import { Goal } from "lucide-react";
import { BarList, Panel, ProgressRing, type BarListRow } from "@/components/shared/DashboardKit";
import type { MonthlyAchievement } from "@/lib/targets/profileAchievementCalculator";
import { formatCurrency } from "@/lib/currency";
import { formatCount } from "@/lib/ui/intlFormat";
import type { AgentTranslator } from "./types";

export interface AgentTargetData {
  /** Null when the super-agent has set no target for this month. */
  achievement: MonthlyAchievement | null;
  currency: string;
  /** Month name for the subtitle, already localised. */
  monthLabel: string;
}

interface Props {
  data: AgentTargetData;
  locale: string;
  t: AgentTranslator;
}

const RING_COLOR = (progress: number) => (progress >= 100 ? "#1baf7a" : progress >= 50 ? "#0242CE" : "#eda100");

/**
 * This month's target as one ring (overall) and a bar per metric the
 * super-agent set. Numbers come from the same calculator the target report
 * uses, so the two never disagree.
 */
export function AgentTargetPanel({ data, locale, t }: Props) {
  const a = data.achievement;
  const href = `/${locale}/agent/target-report`;
  const rows: BarListRow[] = a
    ? [
        a.employerTarget > 0 && {
          key: "employers",
          label: t("target.employers"),
          value: Math.min(a.employerProgress, 100),
          valueLabel: t("target.achievedOf", { achieved: formatCount(a.employerAchieved), target: formatCount(a.employerTarget) }),
          note: `${a.employerProgress}%`,
          color: "#0242CE",
        },
        a.employeeTarget > 0 && {
          key: "placements",
          label: t("target.placements"),
          value: Math.min(a.employeeProgress, 100),
          valueLabel: t("target.achievedOf", { achieved: formatCount(a.employeeAchieved), target: formatCount(a.employeeTarget) }),
          note: `${a.employeeProgress}%`,
          color: "#eb6834",
        },
        a.financeTarget > 0 && {
          key: "finance",
          label: t("target.finance"),
          value: Math.min(a.financeProgress, 100),
          valueLabel: t("target.achievedOf", {
            achieved: formatCurrency(a.financeAchieved, data.currency, "code"),
            target: formatCurrency(a.financeTarget, data.currency, "code"),
          }),
          note: `${a.financeProgress}%`,
          color: "#1baf7a",
        },
      ].filter(Boolean) as BarListRow[]
    : [];

  return (
    <Panel
      id="agent-target"
      icon={Goal}
      iconClassName="bg-amber-100 text-amber-800"
      title={t("target.title")}
      subtitle={t("target.subtitle", { month: data.monthLabel })}
      action={{ href, label: t("target.viewReport") }}
      bodyClassName="gap-4"
    >
      {a ? (
        <div className="flex flex-1 flex-col items-center gap-4 sm:flex-row sm:items-center">
          <ProgressRing value={a.overallProgress} label={t("target.overall")} color={RING_COLOR(a.overallProgress)} size={120} />
          <div className="min-w-0 w-full flex-1">
            <BarList rows={rows} max={100} />
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-4 text-center">
          <ProgressRing value={0} valueLabel="—" label={t("target.overall")} size={104} />
          <p className="text-sm font-medium text-foreground">{t("overview.targetNotSet")}</p>
          <p className="max-w-xs text-xs text-muted-foreground">{t("target.notSetHint")}</p>
          <Link href={href} className="text-xs font-semibold text-primary hover:underline">
            {t("target.viewReport")}
          </Link>
        </div>
      )}
    </Panel>
  );
}
