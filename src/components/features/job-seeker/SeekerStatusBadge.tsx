"use client";

import { useTranslations } from "next-intl";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { SEEKER_STAGE_BADGE_STATUS, seekerStageOf, type SeekerStage } from "@/lib/jobSeeker/seekerStatus";

interface SeekerStatusBadgeProps {
  /** The stored application status, or a seeker step already worked out. */
  status: string;
  stage?: SeekerStage;
  size?: "sm" | "md";
  className?: string;
}

/**
 * An application's status the way the seeker sees it: five steps and two
 * endings rather than the employer's eight stages (lib/jobSeeker/seekerStatus).
 */
export function SeekerStatusBadge({ status, stage, size = "sm", className }: SeekerStatusBadgeProps) {
  const t = useTranslations("seekerStatus");
  const step = stage ?? seekerStageOf(status);
  if (!step) return <StatusBadge status={status} size={size} className={className} />;
  return (
    <StatusBadge
      status={SEEKER_STAGE_BADGE_STATUS[step]}
      label={t(step)}
      size={size}
      className={className}
    />
  );
}
