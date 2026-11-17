"use client";

import { useTranslations } from "next-intl";
import { CircleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/** The engine's hard gates (lib/matching/eligibility.ts IneligibleReason). */
const GATE_REASONS = new Set([
  "country",
  "work_mode",
  "salary",
  "experience",
  "education",
  "experience_unknown",
  "education_unknown",
]);

/**
 * Why a job sits below lower-scored ones in a "Best match" list: it fails one
 * of the seeker's hard requirements (QA 2026-11-17 — a 46% job under a 41% one
 * with nothing on the card to say why). Takes the card's one status-pill slot.
 */
export function GateReasonBadge({ reason }: { reason: string }) {
  const t = useTranslations("jobGate");
  const tReason = useTranslations("jobSeekerJobDetail.match.reasons");
  const key = GATE_REASONS.has(reason) ? reason : "other";
  return (
    <Badge
      variant="warning"
      className="gap-1 py-0 text-[11px]"
      title={t("hint", { reason: tReason(key as "country") })}
    >
      <CircleAlert className="size-3" aria-hidden="true" />
      {t(key as "country")}
    </Badge>
  );
}
