"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import { RecoveryActions } from "@/components/shared/RecoveryActions";

export default function SettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errorBoundary");
  useEffect(() => {
    console.error("[Settings Error]", error);
  }, [error]);

  return (
    <div className="page-container flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-4 p-8 rounded-lg border border-destructive/20 bg-destructive/5 max-w-md text-center">
        <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertTriangle className="w-6 h-6 text-destructive" />
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-destructive">{t("failedSettings")}</h3>
          <p className="text-sm text-muted-foreground">
            {t("failedSettingsDescription")}
          </p>
        </div>
        <RecoveryActions reset={reset} />
      </div>
    </div>
  );
}
