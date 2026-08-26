"use client";

import { useTranslations } from "next-intl";
import {
  SuperAgentPageIntro,
} from "@/components/features/super-agent/WorkspacePage";
import { SuperAgentInsightsPanel } from "@/components/features/super-agent/InsightsPanel";

export default function SuperAgentInsightsPage() {
  const t = useTranslations("superAgentInsights");
  return (
    <div className="page-container">
      <SuperAgentPageIntro
        title={t("title")}
        description={t("description")}
      />
      {/* This panel is the whole page here, so it opens expanded. Everywhere
          else it collapses to a summary bar above that page's own content. */}
      <SuperAgentInsightsPanel defaultExpanded />
    </div>
  );
}
