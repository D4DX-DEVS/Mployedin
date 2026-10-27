"use client";

import { useTranslations } from "next-intl";
import { Bookmark } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SaveJobError, useSavedJobIds, useToggleSavedJob } from "./useSavedJobs";

interface SaveJobButtonProps {
  jobId: string;
  /** "icon" on phone-width card rows; the label shows from `sm` either way. */
  className?: string;
}

/** Bookmark toggle for one job. State is shared, so every copy of a job agrees. */
export function SaveJobButton({ jobId, className }: SaveJobButtonProps) {
  const t = useTranslations("savedJobs");
  const { ids, ready } = useSavedJobIds();
  const toggle = useToggleSavedJob();
  const saved = ids.has(jobId);

  const onClick = () => {
    toggle.mutate(
      { jobId, save: !saved },
      {
        onSuccess: (nowSaved) => toast.success(nowSaved ? t("toastSaved") : t("toastRemoved")),
        onError: (err) => toast.error(err instanceof SaveJobError && err.status === 409 ? t("errorClosed") : t("errorGeneric")),
      },
    );
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!ready || toggle.isPending}
      aria-pressed={saved}
      aria-label={saved ? t("unsaveAria") : t("saveAria")}
      title={saved ? t("unsaveAria") : t("saveAria")}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition-colors disabled:opacity-60",
        saved
          ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
          : "border-border bg-secondary/80 text-muted-foreground hover:bg-accent hover:text-foreground",
        className,
      )}
    >
      <Bookmark className={cn("size-4", saved && "fill-current")} aria-hidden="true" />
      <span className="hidden sm:inline">{saved ? t("saved") : t("save")}</span>
    </button>
  );
}
