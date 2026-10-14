"use client";

import { useTranslations } from "next-intl";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import { ResourceLibrary } from "@/components/features/resources/ResourceLibrary";

export default function ResourceDownloadsPage() {
  const t = useTranslations("resources");
  return (
    <div className="page-container">
      <WorkspaceHeader title={t("downloadsTitle")} context={t("downloadsSubtitle")} />
      {/* Shared with the super-agent page: same cards, filters, detail panel
          and the signed-URL download that fixed new files failing with 403. */}
      <ResourceLibrary />
    </div>
  );
}
