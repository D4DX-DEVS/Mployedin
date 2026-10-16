"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Target } from "lucide-react";
import { AgentSectionTabs, AGENT_PERFORMANCE_TABS } from "@/components/features/agent/AgentSectionTabs";
import { ProfitReportView } from "@/components/features/targets/ProfitReportView";
import { TargetYearSelect, defaultTargetYears } from "@/components/features/targets/TargetYearSelect";
import { ErrorState } from "@/components/shared/ErrorState";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import type { TargetReport } from "@/lib/targets/profitReport";

interface ReportResponse {
  year: number;
  report: TargetReport | null;
}

/** An agent's own profit target report. Nobody else's is reachable from here. */
export default function AgentTargetReportPage() {
  const t = useTranslations("profitTargets");
  const currentYear = String(new Date().getFullYear());
  const years = defaultTargetYears();
  const [year, setYear] = useUrlFilter("year", currentYear, { allow: years });

  const { data, isLoading, isError, refetch } = useQuery<ReportResponse>({
    queryKey: ["agent", "target-report", year],
    queryFn: async () => {
      const response = await fetch(`/api/agent/target-report?year=${year}`);
      if (!response.ok) throw new Error(`Target report error: ${response.status}`);
      return response.json();
    },
    staleTime: 5 * 60_000,
    placeholderData: (previous) => previous,
  });

  return (
    <div className="page-container print:space-y-4">
      <div className="print:hidden">
        <AgentSectionTabs tabs={AGENT_PERFORMANCE_TABS} ariaLabelKey="performanceTabsLabel" />
      </div>
      <WorkspaceHeader
        title={t("agentReportTitle")}
        context={t("agentReportContext", { year })}
        actions={<TargetYearSelect value={year} onChange={setYear} label={t("yearLabel")} years={years} />}
      />

      {isError && !data ? (
        <ErrorState title={t("failedToLoadReport")} onRetry={() => { void refetch(); }} retryLabel={t("retry")} />
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
          <h2 className="heading-section font-semibold">{t("noTargetAssigned")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("contactSupervisor")}</p>
        </div>
      ) : (
        <ProfitReportView report={data.report} />
      )}
    </div>
  );
}
