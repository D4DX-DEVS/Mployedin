"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { ChevronRight, Crown } from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { ReferralSourceChip } from "@/components/shared/ReferralSourceChip";
import type { ReferralSummary } from "@/lib/referrals/summary";

export interface MobileSeeker {
  _id: string;
  fullName?: string;
  email?: string;
  status?: string;
  userId?: { name?: string; email?: string; isActive?: boolean };
  headline?: string;
  education?: { degree?: string; field?: string }[];
  experience?: { jobTitle?: string }[];
  availabilityStatus?: string;
  profileCompleteness?: number;
  referralSummary?: ReferralSummary;
  badges?: string[];
}

interface JobSeekerMobileListProps<T extends MobileSeeker> {
  seekers: T[];
  loading: boolean;
  /** Shown when the list is empty (already carries its own actions). */
  empty: ReactNode;
  /** The seeker's detail page: the full profile opens there, not inline. */
  hrefFor: (seeker: T) => string;
  availabilityLabels: Record<string, string>;
  /** Row actions as one compact "…" menu; null when the viewer has none. */
  renderActions: (seeker: T) => ReactNode;
}

const AVAILABILITY_TONE: Record<string, string> = {
  immediately: "bg-emerald-100 text-emerald-700",
  within_month: "bg-amber-100 text-amber-700",
  not_available: "bg-rose-100 text-rose-700",
};

/** Indent that lines detail rows up under the name, past the 40px avatar. */
const UNDER_NAME = "ps-[3.25rem]";

/**
 * Admin job seekers on phones. The generic table-to-card fallback stacked a
 * second chevron, an empty label column and a lone "…" row onto this table, so
 * phones get a list built for them instead.
 */
export function JobSeekerMobileList<T extends MobileSeeker>({
  seekers,
  loading,
  empty,
  hrefFor,
  availabilityLabels,
  renderActions,
}: JobSeekerMobileListProps<T>) {
  const tr = useTranslations("adminJobSeekers");

  if (loading) {
    return (
      <div className="space-y-2" aria-busy="true">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-muted/60" />
        ))}
      </div>
    );
  }

  if (seekers.length === 0) return <div className="rounded-xl border border-border/70 bg-card px-4 py-10">{empty}</div>;

  return (
    <ul className="space-y-2">
      {seekers.map((js) => {
        const name = js.fullName || js.userId?.name || "—";
        const email = js.email ?? js.userId?.email;
        const role = js.experience?.[0]?.jobTitle || js.headline?.slice(0, 60);
        const edu = js.education?.[0];
        const degree = edu?.degree ? `${edu.degree}${edu.field ? ` - ${edu.field}` : ""}` : null;
        const actions = renderActions(js);

        return (
          // One card per seeker, the menu in the header row: a shared box with
          // a "…" on a line of its own wasted a third of every card.
          <li key={js._id} className="rounded-xl border border-border/70 bg-card p-3 shadow-sm">
            <div className="flex items-start gap-1">
            <Link
              href={hrefFor(js)}
              aria-label={tr("openProfile", { name })}
              className="flex min-h-11 w-full min-w-0 items-start gap-3 rounded-lg text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <UserAvatar name={name} email={email} className="h-10 w-10 shrink-0" colorful />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold text-foreground">{name}</span>
                <span className="truncate text-xs text-muted-foreground">{email ?? "—"}</span>
              </span>
              <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden="true" />
            </Link>
            {actions && <div className="-me-1 -mt-1 shrink-0">{actions}</div>}
            </div>

            {(role || degree) && (
              <div className={`mt-1.5 text-xs ${UNDER_NAME}`}>
                {role && <p className="line-clamp-1 font-medium text-foreground/80">{role}</p>}
                {degree && <p className="line-clamp-1 text-muted-foreground">{degree}</p>}
              </div>
            )}

            <div className={`mt-2 flex flex-wrap items-center gap-1.5 text-[11px] ${UNDER_NAME}`}>
              <StatusBadge status={js.userId?.isActive === false ? "inactive" : (js.status ?? "active")} />
              {js.badges?.includes("premium") && (
                <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">
                  <Crown className="h-3 w-3" aria-hidden="true" />
                  {tr("premiumChip")}
                </span>
              )}
              {js.availabilityStatus && (
                <span className={`rounded-full px-2 py-0.5 font-medium ${AVAILABILITY_TONE[js.availabilityStatus] ?? "bg-blue-100 text-blue-700"}`}>
                  {availabilityLabels[js.availabilityStatus] ?? js.availabilityStatus.replace(/_/g, " ")}
                </span>
              )}
              {js.profileCompleteness != null && (
                <span className="rounded-full bg-muted px-2 py-0.5 font-semibold tabular-nums text-muted-foreground">
                  {tr("tableHeaderProfilePercent")} {js.profileCompleteness}%
                </span>
              )}
              {js.referralSummary && <ReferralSourceChip namespace="adminJobSeekers" summary={js.referralSummary} />}
            </div>

          </li>
        );
      })}
    </ul>
  );
}
