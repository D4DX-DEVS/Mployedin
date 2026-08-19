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
        summaryTitle={t("summaryTitle")}
        summaryDescription={t("summaryDescription")}
      />
      <SuperAgentInsightsPanel />
    </div>
  );
}
