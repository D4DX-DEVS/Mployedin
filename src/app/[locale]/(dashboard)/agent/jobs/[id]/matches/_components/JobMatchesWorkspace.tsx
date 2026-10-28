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
            actions={
              <Link href={jobHref}>
                <Button variant="outline" className="min-h-11 gap-2 rounded-xl">
                  <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />
                  <span className="hidden sm:inline">{t("backToJob")}</span>
                </Button>
              </Link>
            }
          />
        )}
      />
    </div>
  );
}
