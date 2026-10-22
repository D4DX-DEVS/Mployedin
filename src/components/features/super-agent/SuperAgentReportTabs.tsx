"use client";

import { ReportTabs } from "@/components/features/admin/ReportTabs";
import { SUPER_AGENT_REPORT_TABS } from "@/lib/nav/reportRoutes";

/** Team · Targets · Commissions · Market — the strip on every super-agent report. */
export function SuperAgentReportTabs() {
  return (
    <div className="print:hidden">
      <ReportTabs tabs={SUPER_AGENT_REPORT_TABS} namespace="superAgentReportTabs" />
    </div>
  );
}
