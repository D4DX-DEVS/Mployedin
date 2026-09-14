"use client";

import { Handshake } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * "Partner referred" pill. It says only that a recruitment partner referred the
 * candidate — never who. Render it only when `isAgentReferred === true`.
 */
export function ReferredBadge({ size = "sm", className }: { size?: "sm" | "xs"; className?: string }) {
  const t = useTranslations("employerCommon");
  const hint = t("referredBadgeHint");
  return (
    <span
      data-testid="referred-badge"
      title={hint}
      aria-label={hint}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-violet-500/15 font-semibold text-violet-700",
        size === "xs" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]",
        className,
      )}
    >
      <Handshake className={size === "xs" ? "h-2.5 w-2.5" : "h-3 w-3"} aria-hidden />
      {t("referredBadge")}
    </span>
  );
}
