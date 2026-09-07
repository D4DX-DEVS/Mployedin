"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import { RecoveryActions } from "@/components/shared/RecoveryActions";
import { reportError } from "@/lib/observability/report-error";

export default function SuperAgentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errorBoundary");
  useEffect(() => {
    reportError(error, { source: "super-agent-boundary", digest: error.digest });
  }, [error]);

  return (
    <div className="page-container flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-4 p-8 rounded-lg border border-destructive/20 bg-destructive/5 max-w-md text-center">
        <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertTriangle className="w-6 h-6 text-destructive" />
        </div>
        <div className="space-y-2">
          {/* h1: an error boundary replaces the whole page, so this is the only
              heading on it. As an h3 the page had no h1 and started at level 3. */}
          <h1 className="heading-subsection font-semibold text-destructive">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("description")}
          </p>
        </div>
        <RecoveryActions reset={reset} />
      </div>
    </div>
  );
}
