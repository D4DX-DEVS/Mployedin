"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import { reportError } from "@/lib/observability/report-error";
import { RecoveryActions } from "@/components/shared/RecoveryActions";

/**
 * Public-segment error boundary (Next.js App Router convention).
 * Catches unhandled errors in public/marketing pages and shows recovery UI.
 */
export default function PublicError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errorBoundary");
  useEffect(() => {
    reportError(error, { source: "public-boundary", digest: error.digest });
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center space-y-4 max-w-md px-6">
        <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertTriangle className="w-6 h-6 text-destructive" aria-hidden="true" />
        </div>

        <h2 className="heading-section font-semibold">{t("title")}</h2>

        <p className="text-sm text-muted-foreground">
          {t("description")}
        </p>

        {error.digest && (
          <p className="text-xs text-muted-foreground font-mono">
            {t("errorId", { digest: error.digest })}
          </p>
        )}

        <RecoveryActions reset={reset} />
      </div>
    </div>
  );
}
