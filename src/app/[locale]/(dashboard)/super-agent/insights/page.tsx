"use client";

import {
  SuperAgentPageIntro,
} from "@/components/features/super-agent/WorkspacePage";
import { SuperAgentInsightsPanel } from "@/components/features/super-agent/InsightsPanel";

export default function SuperAgentInsightsPage() {
  return (
    <div className="page-container space-y-6">
      <SuperAgentPageIntro
        title="Insights"
        description="AI-powered alerts, opportunities, and recommendations derived from your team's real-time performance data."
        summaryTitle="Insight engine"
        summaryDescription="Surfaced from your team's activity over the last 7 days and ranked by confidence, so you can act on what matters most."
      />
      <SuperAgentInsightsPanel />
    </div>
  );
}
