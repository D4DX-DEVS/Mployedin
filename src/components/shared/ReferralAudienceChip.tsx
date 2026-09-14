"use client";

import { useTranslations } from "next-intl";
import type { ReferralAudience } from "@/lib/referrals/url";

/**
 * Audience pill for a referral link. A missing audience is an employer link:
 * every document written before job-seeker links existed has no `audience`.
 */
export function ReferralAudienceChip({
  audience,
  namespace,
}: {
  audience?: ReferralAudience;
  namespace: "agentReferralLinks" | "superAgentReferralLinks" | "adminReferralLinks";
}) {
  const t = useTranslations(namespace);
  const isSeeker = audience === "job_seeker";
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${
        isSeeker ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-700"
      }`}
    >
      {isSeeker ? t("audienceChipJobSeeker") : t("audienceChipEmployer")}
    </span>
  );
}
