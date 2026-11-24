"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/** Colour per application status; the label always carries the meaning too. */
const STATUS_CLASS: Record<string, string> = {
  applied: "bg-primary/10 text-primary",
  shortlisted: "bg-violet-100 text-violet-800",
  interview_scheduled: "bg-sky-100 text-sky-800",
  selected: "bg-violet-100 text-violet-800",
  offer: "bg-amber-100 text-amber-800",
  hired: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
  withdrawn: "bg-muted text-muted-foreground",
};

/** The words for an application status, the same ones the seeker's Applications card uses. */
export function useApplicationStatusLabel(): (status: string) => string {
  const t = useTranslations("superAgentJobSeekers");
  return useCallback(
    (status: string) => {
      // Literal keys only — a template-literal key escapes the missing-key checks.
      switch (status) {
        case "applied": return t("detail.applications.status.applied");
        case "shortlisted": return t("detail.applications.status.shortlisted");
        case "interview_scheduled": return t("detail.applications.status.interview_scheduled");
        case "selected": return t("detail.applications.status.selected");
        case "offer": return t("detail.applications.status.offer");
        case "hired": return t("detail.applications.status.hired");
        case "rejected": return t("detail.applications.status.rejected");
        case "withdrawn": return t("detail.applications.status.withdrawn");
        default: return t("detail.applications.status.other");
      }
    },
    [t],
  );
}

interface ApplicationStatusPillProps {
  status: string;
  className?: string;
}

/** A small coloured pill naming where an application stands. */
export function ApplicationStatusPill({ status, className }: ApplicationStatusPillProps) {
  const label = useApplicationStatusLabel();
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold",
        STATUS_CLASS[status] ?? "bg-muted text-foreground",
        className,
      )}
    >
      {label(status)}
    </span>
  );
}
