"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import { RecoveryActions } from "@/components/shared/RecoveryActions";
import { reportError } from "@/lib/observability/report-error";

export default function AdminReportsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errorBoundary");
  useEffect(() => {
    reportError(error, { source: "admin-reports-boundary", digest: error.digest });
  }, [error]);

  return (
    <div className="page-container flex min-h-[60vh] items-center justify-center">
      <div className="workspace-panel-surface flex max-w-md flex-col items-center gap-4 rounded-3xl p-8 text-center">
        <div className="workspace-tone-amber rounded-full p-3">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <div className="space-y-2">
          <h2 className="heading-section font-semibold text-foreground">{t("failedReports")}</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            {t("failedReportsDescription")}
          </p>
        </div>
        <RecoveryActions reset={reset} />
      </div>
    </div>
  );
}
