import { AlertCircle, Info, Lightbulb } from "lucide-react";
import { Panel, StatRows, type StatRow } from "@/components/shared/DashboardKit";
import type { DataInsight, InsightId } from "@/lib/admin/dashboard/insights.server";
import { formatCount } from "@/lib/ui/intlFormat";
import type { DashboardTranslator } from "./types";

const KEYS: Record<InsightId, string> = {
  "seekers-incomplete-profile": "seekersIncompleteProfile",
  "seekers-not-onboarded": "seekersNotOnboarded",
  "seekers-no-skills": "seekersNoSkills",
  "users-unverified-email": "usersUnverifiedEmail",
  "users-dormant-30d": "usersDormant",
  "employers-basic-verification": "employersBasicVerification",
  "employers-no-logo": "employersNoLogo",
  "jobs-no-salary": "jobsNoSalary",
  "jobs-expiring-7d": "jobsExpiring",
  "jobs-stale-drafts": "jobsStaleDrafts",
};

interface Props {
  insights: readonly DataInsight[];
  locale: string;
  t: DashboardTranslator;
}

/** Quick findings: records missing something a user could fix, with the list that shows them. */
export function InsightsPanel({ insights, locale, t }: Props) {
  const rows: StatRow[] = insights.map((row) => ({
    key: row.id,
    label: t(`insights.items.${KEYS[row.id]}`),
    value: formatCount(row.count),
    tone: row.severity === "warning" ? "warning" : "info",
    icon: row.severity === "warning" ? AlertCircle : Info,
    href: `/${locale}${row.path}`,
  }));
  return (
    <Panel id="admin-insights" icon={Lightbulb} iconClassName="bg-amber-100 text-amber-900" title={t("insights.title")} subtitle={t("insights.description")}>
      {rows.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">{t("insights.empty")}</p> : <StatRows rows={rows} />}
    </Panel>
  );
}
