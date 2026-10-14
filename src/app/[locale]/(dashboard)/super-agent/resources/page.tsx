"use client";

import { useTranslations } from "next-intl";
import { SuperAgentPageIntro } from "@/components/features/super-agent/WorkspacePage";
import { ResourceLibrary } from "@/components/features/resources/ResourceLibrary";

export default function ResourceDownloadsPage() {
  const t = useTranslations("resources");
  return (
    <div className="page-container">
      <SuperAgentPageIntro title={t("downloadsTitle")} description={t("downloadsSubtitle")} />
      {/* Shared with the agent page: same cards, filters, detail panel and
          the signed-URL download that fixed new files failing with 403. */}
      <ResourceLibrary />
    </div>
  );
}
