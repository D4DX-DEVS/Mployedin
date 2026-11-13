"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft, UserSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import { JobMatches } from "@/components/features/jobs/matching/JobMatches";

interface JobMatchesWorkspaceProps {
  locale: string;
  jobId: string;
}

export function JobMatchesWorkspace({ locale, jobId }: JobMatchesWorkspaceProps) {
  const t = useTranslations("agentJobMatches");
  const jobHref = `/${locale}/agent/jobs/${jobId}`;

  return (
    <div className="page-container">
      <Link
        href={jobHref}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden /> {t("backToJob")}
      </Link>
      <JobMatches
        jobId={jobId}
        role="agent"
        applicantsHref={`/${locale}/agent/candidates?jobId=${jobId}`}
        emptyAction={
          <Link href={jobHref}>
            <Button variant="outline" className="min-h-11 rounded-xl">{t("backToJob")}</Button>
          </Link>
        }
        header={(data, refreshing) => (
          <WorkspaceHeader
            icon={UserSearch}
            title={t("title")}
            context={data?.job.title ?? " "}
            status={refreshing ? t("refreshing") : undefined}
          />
        )}
      />
    </div>
  );
}
