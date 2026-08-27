"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
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
          <svg
            className="w-6 h-6 text-destructive"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
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
