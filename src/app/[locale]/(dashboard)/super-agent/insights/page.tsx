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
        summaryDescription="Insights are generated from the /api/super-agent/insights endpoint using 7-day activity windows with confidence scoring."
      />
      <SuperAgentInsightsPanel />
    </div>
  );
}
