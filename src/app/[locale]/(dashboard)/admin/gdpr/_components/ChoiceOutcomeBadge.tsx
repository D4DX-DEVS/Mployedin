"use client";

import { CheckCircle2, SlidersHorizontal, XCircle, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CookieChoiceOutcome } from "@/lib/gdpr/cookieChoiceOutcome";
import { useGdprLabels } from "./useGdprLabels";

/** The icon for each outcome, wherever a choice is shown (this badge, the lookup's result heading). */
export const CHOICE_OUTCOME_ICON: Record<CookieChoiceOutcome, LucideIcon> = {
  accepted: CheckCircle2,
  rejected: XCircle,
  custom: SlidersHorizontal,
};

const VARIANT: Record<CookieChoiceOutcome, "success" | "warning" | "info"> = {
  accepted: "success",
  rejected: "warning",
  custom: "info",
};

/** Accepted all / Rejected all / Custom choice: always the words and an icon, never colour alone. */
export function ChoiceOutcomeBadge({ outcome, className }: { outcome: CookieChoiceOutcome; className?: string }) {
  const { outcomeLabel } = useGdprLabels();
  const Icon = CHOICE_OUTCOME_ICON[outcome];
  return (
    <Badge variant={VARIANT[outcome]} data-choice-outcome={outcome} className={cn("gap-1 whitespace-nowrap", className)}>
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {outcomeLabel(outcome)}
    </Badge>
  );
}
