"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function AdminReportsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Admin Reports Error]", error);
  }, [error]);

  return (
    <div className="page-container flex min-h-[60vh] items-center justify-center">
      <div className="workspace-panel-surface flex max-w-md flex-col items-center gap-4 rounded-[28px] p-8 text-center">
        <div className="workspace-tone-amber rounded-full p-3">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">Failed to load reports</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            {error.message || "An unexpected error occurred while loading the admin reports workspace."}
          </p>
        </div>
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <RefreshCw className="h-4 w-4" />
          Try Again
        </button>
      </div>
    </div>
  );
}