"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Briefcase } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useWorkflowTemplateJobs, type WorkflowTemplateItem } from "@/hooks/useWorkflowTemplates";

const SOURCE_KEYS = { auto: "sourceAuto", manual: "sourceManual", custom: "sourceCustom" } as const;
const JOB_STATUS_KEYS: Record<string, string> = {
  draft: "jobStatusDraft",
  active: "jobStatusActive",
  paused: "jobStatusPaused",
  closed: "jobStatusClosed",
  expired: "jobStatusExpired",
};

interface TemplateJobsDialogProps {
  template: WorkflowTemplateItem | null;
  onClose: () => void;
}

/** "Used by N jobs": which jobs run on the template, and on which version. */
export function TemplateJobsDialog({ template, onClose }: TemplateJobsDialogProps) {
  const t = useTranslations("workflowTemplates");
  const locale = useLocale();
  const { data, isLoading, isError, refetch } = useWorkflowTemplateJobs(template?._id ?? null);

  return (
    <Dialog open={Boolean(template)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("jobsDialogTitle", { name: template?.name ?? "" })}</DialogTitle>
          <DialogDescription>{t("jobsDialogDescription", { version: template?.version ?? 1 })}</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-muted/50" />)}
          </div>
        ) : isError ? (
          <div className="space-y-2 py-4 text-center">
            <p className="text-sm text-muted-foreground">{t("jobsLoadError")}</p>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>{t("retry")}</Button>
          </div>
        ) : !data || data.jobs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Briefcase className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">{t("jobsEmpty")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            <ul className="divide-y divide-border rounded-xl border border-border">
              {data.jobs.map((job) => (
                <li key={job._id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                  <div className="min-w-0">
                    <Link href={`/${locale}/admin/jobs?job=${job._id}`} className="block truncate text-sm font-medium text-foreground hover:underline">
                      {job.title || t("untitledJob")}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">{job.companyName || "—"}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className="text-[11px]">{t("versionBadge", { version: job.version })}</Badge>
                    <Badge variant="secondary" className="text-[11px]">{t(SOURCE_KEYS[job.source] ?? "sourceAuto")}</Badge>
                    <Badge variant="outline" className="text-[11px]">{JOB_STATUS_KEYS[job.status] ? t(JOB_STATUS_KEYS[job.status]) : job.status}</Badge>
                  </div>
                </li>
              ))}
            </ul>
            {data.total > data.jobs.length && (
              <p className="text-xs text-muted-foreground">{t("jobsMore", { shown: data.jobs.length, total: data.total })}</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
