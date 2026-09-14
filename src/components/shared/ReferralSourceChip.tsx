"use client";

import { Handshake } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReferralSummary } from "@/lib/referrals/summary";

/**
 * Staff-side "who referred this seeker" chip. What it shows follows what the
 * API put in `referralSummary` for the viewer's role: admins get role + name,
 * super-agents get "by you" or "via <agent>", agents get "by you" or nothing.
 * It renders only what the server already decided the viewer may see.
 */
export function ReferralSourceChip({
  summary,
  namespace,
}: {
  summary?: ReferralSummary;
  namespace: "adminJobSeekers" | "agentJobSeekers" | "superAgentJobSeekers";
}) {
  const t = useTranslations(namespace);
  if (!summary) return null;

  const pill =
    "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium";

  if (namespace === "adminJobSeekers") {
    const isSA = summary.role === "super_agent";
    return (
      <span className="inline-flex flex-col items-start gap-0.5">
        <span className={`${pill} ${isSA ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
          <Handshake className="h-3 w-3" aria-hidden />
          {isSA ? t("referredByRoleSuperAgent") : t("referredByRoleAgent")}
        </span>
        {summary.name ? <span className="text-xs text-muted-foreground">{summary.name}</span> : null}
      </span>
    );
  }

  if (namespace === "superAgentJobSeekers") {
    return (
      <span className={`${pill} bg-violet-100 text-violet-700`}>
        <Handshake className="h-3 w-3" aria-hidden />
        {summary.isMine ? t("referredByYouChip") : t("referredViaChip", { name: summary.name || "" })}
      </span>
    );
  }

  // Agents see only their own referrals named; a colleague's stays invisible.
  if (!summary.isMine) return null;
  return (
    <span className={`${pill} bg-violet-100 text-violet-700`}>
      <Handshake className="h-3 w-3" aria-hidden />
      {t("referredByYouChip")}
    </span>
  );
}
