"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, Crown } from "lucide-react";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ErrorState } from "@/components/shared/ErrorState";
import { ResumeViewerModal } from "@/components/shared/ResumeViewerModal";
import { ProfileDetailSkeleton } from "@/components/ui/loading/ProfileDetailSkeleton";
import { JobSeekerExpandedRow, type ExpandedSeeker } from "../_components/JobSeekerExpandedRow";

interface DetailSeeker extends ExpandedSeeker {
  status?: string;
  badges?: string[];
  userId?: { name?: string; email?: string; isActive?: boolean };
}

type LoadState = "loading" | "ready" | "notFound" | "error";

/**
 * One job seeker's full profile on its own page. It used to open inline in the
 * list ("advanced view"), which on a phone pushed the rest of the list a few
 * screens down; the list now links here instead (owner, 2026-11-09). Same
 * guarded API the list's actions use: GET /api/job-seekers/[id].
 */
export default function AdminJobSeekerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const locale = useLocale();
  const tr = useTranslations("adminJobSeekers");
  const [seeker, setSeeker] = useState<DetailSeeker | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [viewCv, setViewCv] = useState(false);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await fetch(`/api/job-seekers/${id}`);
      if (res.status === 404 || res.status === 400) { setState("notFound"); return; }
      if (!res.ok) { setState("error"); return; }
      const data = (await res.json()) as { jobSeeker: DetailSeeker };
      setSeeker(data.jobSeeker);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const availabilityLabels: Record<string, string> = {
    immediately: tr("availabilityImmediately"),
    within_month: tr("availabilityWithinMonth"),
    within_3_months: tr("availabilityWithin3Months"),
    not_available: tr("availabilityNotAvailable"),
  };

  const name = seeker?.fullName || seeker?.userId?.name || "—";
  const email = seeker?.email ?? seeker?.userId?.email;

  return (
    <div className="page-container space-y-4">
      <Link
        href={`/${locale}/admin/job-seekers`}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
        {tr("backToList")}
      </Link>

      {state === "loading" && <ProfileDetailSkeleton />}
      {state === "error" && <ErrorState onRetry={() => void load()} />}
      {state === "notFound" && <ErrorState description={tr("profileNotFound")} />}

      {state === "ready" && seeker && (
        <>
          <header className="flex items-start gap-3">
            <UserAvatar name={name} email={email} className="h-12 w-12 shrink-0" colorful />
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-semibold leading-tight text-foreground">{name}</h1>
              {email && <p className="truncate text-sm text-muted-foreground">{email}</p>}
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                <StatusBadge status={seeker.userId?.isActive === false ? "inactive" : (seeker.status ?? "active")} />
                {seeker.badges?.includes("premium") && (
                  <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-500/15 px-2 py-0.5 font-medium text-amber-800">
                    <Crown className="h-3 w-3" aria-hidden="true" />
                    {tr("premiumChip")}
                  </span>
                )}
              </div>
            </div>
          </header>

          <JobSeekerExpandedRow
            seeker={seeker}
            locale={locale}
            availabilityLabel={seeker.availabilityStatus ? (availabilityLabels[seeker.availabilityStatus] ?? seeker.availabilityStatus.replace(/_/g, " ")) : undefined}
            onViewCv={() => setViewCv(true)}
          />
        </>
      )}

      {viewCv && seeker && (
        <ResumeViewerModal
          url={`/api/employers/candidates/${seeker._id}/cv#cv.pdf`}
          candidateName={name}
          jobSeekerId={seeker._id}
          onClose={() => setViewCv(false)}
        />
      )}
    </div>
  );
}
