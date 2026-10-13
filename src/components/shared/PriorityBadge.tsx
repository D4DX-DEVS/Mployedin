"use client";

import { Crown } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * "Priority" pill: the applicant is a Premium job seeker, so the application
 * is reviewed first (client decision 2026-10-12). Same shape as
 * `ReferredBadge`, which it sits beside. Render it only when
 * `isPriority === true`.
 */
export function PriorityBadge({ size = "sm", className }: { size?: "sm" | "xs"; className?: string }) {
  const t = useTranslations("employerCommon");
  const hint = t("priorityBadgeHint");
  return (
    <span
      data-testid="priority-badge"
      title={hint}
      aria-label={hint}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-amber-500/15 font-semibold text-amber-800",
        size === "xs" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]",
        className,
      )}
    >
      <Crown className={size === "xs" ? "h-2.5 w-2.5" : "h-3 w-3"} aria-hidden />
      {t("priorityBadge")}
    </span>
  );
}
