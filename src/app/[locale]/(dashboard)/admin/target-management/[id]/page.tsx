"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, MapPin, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ErrorState } from "@/components/shared/ErrorState";
import { TargetEmptyState } from "@/components/features/targets/TargetComponents";
import { ProfitReportView } from "@/components/features/targets/ProfitReportView";
import type { TargetReport } from "@/lib/targets/profitReport";

interface ProfileHeader {
  assigneeName: string;
  assigneeEmail: string;
  assigneeRole: string;
  year: number;
  region?: string;
  distributionStrategy: string;
  status: string;
  notes?: string;
}

async function getJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Target error: ${res.status}`);
  return res.json();
}

/** One profit target as admin sees it: who it is for, and the same report that person (or their super agent) gets. */
export default function AdminTargetProfileDetailPage() {
  const t = useTranslations("profitTargets");
  const params = useParams();
  const router = useRouter();
  const locale = (params.locale as string) || "en";
  const id = params.id as string;

  const header = useQuery({
    queryKey: ["admin", "target-profile", id],
    queryFn: async () => (await getJson<{ profile: ProfileHeader }>(`/api/admin/target-profiles/${id}`))?.profile ?? null,
  });
  const report = useQuery({
    queryKey: ["admin", "target-report", "profile", id],
    queryFn: async () => (await getJson<{ report: TargetReport }>(`/api/admin/target-report?profileId=${id}`))?.report ?? null,
  });

  const back = (
    <Link
      href={`/${locale}/admin/target-management`}
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" /> {t("backToTargets")}
    </Link>
  );

  if (header.isLoading || report.isLoading) {
    return (
      <div className="page-container">
        <div className="h-8 w-40 animate-pulse rounded-xl bg-muted" />
        <div className="h-56 animate-pulse rounded-2xl bg-muted/50" />
      </div>
    );
  }

  if (header.isError || report.isError) {
    return (
      <div className="page-container">
        {back}
        <ErrorState
          title={t("failedToLoadProfile")}
          onRetry={() => { void header.refetch(); void report.refetch(); }}
          retryLabel={t("retry")}
        />
      </div>
    );
  }

  const profile = header.data;
  if (!profile || !report.data) {
    return (
      <div className="page-container">
        <TargetEmptyState
          title={t("notFound")}
          action={
            <Link href={`/${locale}/admin/target-management`}>
              <Button variant="outline" className="gap-2 rounded-xl">
                <ArrowLeft className="h-4 w-4" /> {t("backToTargets")}
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="page-container">
      {back}

      <div className="workspace-glass-panel panel-body rounded-2xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="workspace-tone-sky rounded-2xl p-3.5">
              <Target className="h-6 w-6" />
            </div>
            <div>
              <h1 className="page-header-title font-semibold tracking-tight">{profile.assigneeName}</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {profile.year} · {profile.assigneeRole === "super_agent" ? t("roleSuperAgent") : t("roleAgent")} · {profile.assigneeEmail}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {profile.region && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                    <MapPin className="h-3 w-3" /> {profile.region}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {t("strategyValue", { strategy: t(`strategy_${profile.distributionStrategy}`) })}
                </span>
              </div>
              {profile.notes && (
                <p className="mt-2 rounded-lg bg-muted/40 px-3 py-2 text-sm text-muted-foreground">{profile.notes}</p>
              )}
            </div>
          </div>
          <StatusBadge status={profile.status} />
        </div>
      </div>

      <ProfitReportView
        report={report.data}
        onSelectAgent={(agent) => router.push(`/${locale}/admin/target-management/${agent.profileId}`)}
      />
    </div>
  );
}
