"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, UserSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import { JobMatches } from "@/components/features/jobs/matching/JobMatches";

/**
 * Candidates in the database ranked for any job, with an invite to apply —
 * the same list employers, agents and super agents use. Admin may source for
 * every job; the invite goes out in the job's employer's name.
 */
export default function AdminJobMatchesPage() {
  const { locale, id } = useParams<{ locale: string; id: string }>();
  const t = useTranslations("agentJobMatches");
  const jobsHref = `/${locale}/admin/jobs`;

  return (
    <div className="page-container">
      <JobMatches
        jobId={id}
        role="admin"
        applicantsHref={`/${locale}/admin/applications?jobId=${id}`}
        emptyAction={
          <Link href={jobsHref}>
            <Button variant="outline" className="min-h-11 rounded-xl">{t("admin.backToJobs")}</Button>
          </Link>
        }
        header={(data, refreshing) => (
          <WorkspaceHeader
            icon={UserSearch}
            title={t("title")}
            context={data?.job.title ?? " "}
            status={refreshing ? t("refreshing") : undefined}
            actions={
              <Link href={jobsHref}>
                <Button variant="outline" className="min-h-11 gap-2 rounded-xl">
                  <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />
                  <span className="hidden sm:inline">{t("admin.backToJobs")}</span>
                </Button>
              </Link>
            }
          />
        )}
      />
    </div>
  );
}
