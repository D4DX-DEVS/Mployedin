"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatListDate } from "@/lib/ui/intlFormat";
import type { SeekerApplicationRow } from "@/lib/jobseekers/hiringStatus";

interface SeekerApplicationsCardProps {
  applications: readonly SeekerApplicationRow[];
  className?: string;
}

/**
 * Which job each of a seeker's applications is for and where it stands on
 * Mployedin, newest change first. Staff profile views (admin page, super-agent
 * panel) share it so the "last status" reads the same everywhere.
 */
export function SeekerApplicationsCard({ applications, className }: SeekerApplicationsCardProps) {
  const t = useTranslations("superAgentJobSeekers");
  const locale = useLocale();
  const statusLabel = (status: string): string => {
    // Literal keys only — a template-literal key escapes the missing-key checks.
    switch (status) {
      case "applied": return t("detail.applications.status.applied");
      case "shortlisted": return t("detail.applications.status.shortlisted");
      case "interview_scheduled": return t("detail.applications.status.interview_scheduled");
      case "selected": return t("detail.applications.status.selected");
      case "offer": return t("detail.applications.status.offer");
      case "hired": return t("detail.applications.status.hired");
      case "rejected": return t("detail.applications.status.rejected");
      case "withdrawn": return t("detail.applications.status.withdrawn");
      default: return t("detail.applications.status.other");
    }
  };

  return (
    <section className={className ?? "rounded-xl border border-border bg-card p-4"}>
      <h3 className="text-sm font-semibold text-foreground">{t("detail.applications.title")}</h3>
      {applications.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">{t("detail.applications.empty")}</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {applications.map((app) => (
            <li key={app.id} className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p dir="auto" className="break-words text-sm font-medium text-foreground">{app.jobTitle}</p>
                <p dir="auto" className="text-xs text-muted-foreground">
                  {[app.company, t("detail.applications.updated", { date: formatListDate(app.updatedAt, locale) })].filter(Boolean).join(" · ")}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground">
                {statusLabel(app.status)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
