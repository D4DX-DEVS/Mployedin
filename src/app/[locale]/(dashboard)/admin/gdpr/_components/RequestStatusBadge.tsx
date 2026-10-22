"use client";

import { useTranslations } from "next-intl";
import { StatusBadge } from "@/components/shared/StatusBadge";

/**
 * A request's status as a badge. The shared badge has no entry for
 * "in_progress" and printed "Unknown status" for every request an admin had
 * started, so that one is worded here.
 */
export function RequestStatusBadge({ status }: { status: string }) {
  const t = useTranslations("adminGdpr");
  return <StatusBadge status={status} label={status === "in_progress" ? t("inProgressStatusLabel") : undefined} />;
}
