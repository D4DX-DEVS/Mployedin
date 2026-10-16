"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ArrowLeft, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProfitReportView } from "@/components/features/targets/ProfitReportView";
import { TargetYearSelect, defaultTargetYears } from "@/components/features/targets/TargetYearSelect";
import { ErrorState } from "@/components/shared/ErrorState";
import { SuperAgentPageIntro } from "@/components/features/super-agent/WorkspacePage";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import type { TargetReport } from "@/lib/targets/profitReport";

interface ReportResponse {
  year: number;
  report: TargetReport | null;
}

const OBJECT_ID = /^[0-9a-f]{24}$/i;

/**
 * A super agent's profit target report: their own, with the team underneath.
 * Opening an agent shows that agent's report; the API only serves agents in
 * this super agent's team.
 */
export default function SuperAgentTargetReportPage() {
  const t = useTranslations("profitTargets");
  const currentYear = String(new Date().getFullYear());
  const years = defaultTargetYears();
  const [year, setYear] = useUrlFilter("year", currentYear, { allow: years });
  const [agentParam, setAgentId] = useUrlFilter("agentId", "");
  // A hand-edited link must not send a malformed id to the API.
  const agentId = OBJECT_ID.test(agentParam) ? agentParam : "";

  const { data, isLoading, isError, error, refetch } = useQuery<ReportResponse>({
    queryKey: ["super-agent", "target-report", year, agentId],
    queryFn: async () => {
      const response = await fetch(`/api/super-agent/target-report?year=${year}${agentId ? `&agentId=${agentId}` : ""}`);
      if (!response.ok) throw new Error(String(response.status));
      return response.json();
    },
    staleTime: 5 * 60_000,
    placeholderData: (previous) => previous,
    retry: false,
  });

  // An agent outside the team answers 403: say so instead of a generic failure.
  const notInTeam = isError && error instanceof Error && error.message === "403";

  return (
    <div className="page-container print:space-y-4">
      <SuperAgentPageIntro
        title={agentId && data?.report ? t("agentReportOf", { name: data.report.person.name || t("unknownPerson") }) : t("saReportTitle")}
        description={t("saReportDescription", { year })}
        inlineActions
      >
        <TargetYearSelect value={year} onChange={setYear} label={t("yearLabel")} years={years} />
      </SuperAgentPageIntro>

      {agentId ? (
        <div className="print:hidden">
          <Button variant="outline" size="sm" className="gap-1.5 rounded-lg" onClick={() => setAgentId("")}>
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t("backToTeamReport")}
          </Button>
        </div>
      ) : null}

      {isError && !data ? (
        <ErrorState
          title={notInTeam ? t("agentNotInTeam") : t("failedToLoadReport")}
          onRetry={notInTeam ? () => setAgentId("") : () => { void refetch(); }}
          retryLabel={notInTeam ? t("backToTeamReport") : t("retry")}
        />
      ) : isLoading || !data ? (
        <div className="space-y-4" role="status" aria-live="polite" aria-label={t("loading")}>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-28 animate-pulse rounded-2xl bg-muted/50" />
            ))}
          </div>
          <div className="h-72 animate-pulse rounded-2xl bg-muted/50" />
        </div>
      ) : !data.report ? (
        <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
          <Target className="mb-4 h-12 w-12 text-muted-foreground/40" />
          <h2 className="heading-section font-semibold">{agentId ? t("agentNoTarget") : t("noTargetAssigned")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{agentId ? t("agentNoTargetHint") : t("saNoTargetHint")}</p>
        </div>
      ) : (
        <ProfitReportView
          report={data.report}
          onSelectAgent={agentId ? undefined : (agent) => setAgentId(agent.userId)}
        />
      )}
    </div>
  );
}
