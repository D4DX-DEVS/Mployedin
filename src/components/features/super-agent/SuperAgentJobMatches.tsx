"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft, UserSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import { ResumeViewerModal } from "@/components/shared/ResumeViewerModal";
import { JobMatches } from "@/components/features/jobs/matching/JobMatches";
import { SeekerDetailPanel } from "@/components/features/super-agent/SeekerDetailPanel";

interface SuperAgentJobMatchesProps {
  locale: string;
  jobId: string;
}

/**
 * A super agent's matching list for one job in their book: ranked candidates,
 * the full profile for those in their team or territory (the server decides
 * which), and an invite to apply sent through /api/super-agent/invite.
 */
export function SuperAgentJobMatches({ locale, jobId }: SuperAgentJobMatchesProps) {
  const t = useTranslations("agentJobMatches");
  const tSeekers = useTranslations("superAgentJobSeekers");
  const jobsHref = `/${locale}/super-agent/jobs`;
  const [profileId, setProfileId] = useState<string | null>(null);
  const [cvSeeker, setCvSeeker] = useState<{ id: string; name: string } | null>(null);

  return (
    <div className="page-container">
      <JobMatches
        jobId={jobId}
        role="super_agent"
        onViewProfile={(candidate) => setProfileId(candidate.jobSeekerId)}
        emptyAction={
          <Link href={jobsHref}>
            <Button variant="outline" className="min-h-11 rounded-xl">{t("superAgent.backToJobs")}</Button>
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
                  <span className="hidden sm:inline">{t("superAgent.backToJobs")}</span>
                </Button>
              </Link>
            }
          />
        )}
      />

      {/* The profile docks beside the list, as on the job seekers page. */}
      <Dialog open={profileId !== null && !cvSeeker} onOpenChange={(open) => { if (!open) setProfileId(null); }}>
        <DialogContent side="end" className="flex flex-col gap-0 p-0 sm:max-w-xl" aria-describedby={undefined}>
          <DialogTitle className="sr-only">{tSeekers("viewProfile")}</DialogTitle>
          <SeekerDetailPanel seekerId={profileId} onViewCv={setCvSeeker} />
        </DialogContent>
      </Dialog>
      {/* Closing the CV brings the profile back where it was. */}
      {cvSeeker && (
        <ResumeViewerModal url={`/api/employers/candidates/${cvSeeker.id}/cv#cv.pdf`} candidateName={cvSeeker.name} onClose={() => setCvSeeker(null)} />
      )}
    </div>
  );
}
