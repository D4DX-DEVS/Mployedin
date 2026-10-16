"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Building2, CheckCircle2, MapPin, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/ui/intlFormat";
import type { ApplicationRow, CandidateRow, CopilotView, JobCard, StatTile } from "@/lib/ai/copilot/views";
import { sameOriginPath } from "./links";

interface CopilotViewCardProps {
  view: CopilotView;
  /** In-app link followed, e.g. a job card opening its job page. */
  onInternalLink: () => void;
}

/** Cards for the rows a Copilot read tool returned (see `@/lib/ai/copilot/views`). */
export function CopilotViewCard({ view, onInternalLink }: CopilotViewCardProps) {
  switch (view.kind) {
    case "jobs":
      return <JobCards jobs={view.jobs} more={view.more} onInternalLink={onInternalLink} />;
    case "candidates":
      return <CandidateRows candidates={view.candidates} more={view.more} />;
    case "applications":
      return <ApplicationRows applications={view.applications} more={view.more} />;
    case "stats":
      return <StatsTiles tiles={view.tiles} rows={view.rows} />;
    default:
      return null;
  }
}

function useStatusLabel(): (status: string) => string {
  const t = useTranslations("statusBadge");
  return (status) => (t.has(status) ? t(status) : status.replace(/_/g, " "));
}

function MatchBadge({ score, muted = false }: { score: number; muted?: boolean }) {
  const t = useTranslations("copilot");
  return (
    <span
      aria-label={t("views.matchLabel", { score: Math.round(score) })}
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
        muted ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
      )}
    >
      {Math.round(score)}%
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const label = useStatusLabel();
  return <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-foreground">{label(status)}</span>;
}

function SkillChips({ skills }: { skills: string[] }) {
  return (
    <>
      {skills.slice(0, 3).map((skill) => (
        <span key={skill} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {skill}
        </span>
      ))}
    </>
  );
}

function More({ count }: { count: number }) {
  const t = useTranslations("copilot");
  return count > 0 ? <p className="ps-1 text-xs text-muted-foreground">{t("previewMore", { count })}</p> : null;
}

function JobCards({ jobs, more, onInternalLink }: { jobs: JobCard[]; more: number; onInternalLink: () => void }) {
  const t = useTranslations("copilot");
  return (
    <div className="space-y-2">
      {jobs.map((job, index) => {
        const path = typeof window === "undefined" ? null : sameOriginPath(job.url, window.location.origin);
        const title = <span className="line-clamp-2 text-sm font-medium text-foreground">{job.title}</span>;
        return (
          <div key={job.jobId || `job-${index}`} className="rounded-lg border border-border bg-card p-3 text-xs">
            <div className="flex items-start justify-between gap-2">
              {path ? (
                <Link href={path} onClick={onInternalLink} className="min-w-0 hover:underline">
                  {title}
                </Link>
              ) : (
                <span className="min-w-0">{title}</span>
              )}
              {job.matchScore !== undefined && <MatchBadge score={job.matchScore} muted={!job.strongMatch} />}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
              {job.company && (
                <span className="inline-flex min-w-0 items-center gap-1">
                  <Building2 className="size-3.5 shrink-0" aria-hidden />
                  {job.company}
                </span>
              )}
              {job.location && (
                <span className="inline-flex min-w-0 items-center gap-1">
                  <MapPin className="size-3.5 shrink-0" aria-hidden />
                  {job.location}
                </span>
              )}
              {job.salary && <span>{job.salary}</span>}
            </div>
            {(job.strongMatch || job.alreadyApplied || job.skills.length > 0) && (
              <div className="mt-2 flex flex-wrap gap-1">
                {job.strongMatch && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                    <Sparkles className="size-3" aria-hidden />
                    {t("views.strongMatch")}
                  </span>
                )}
                {job.alreadyApplied && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-foreground">
                    <CheckCircle2 className="size-3" aria-hidden />
                    {t("views.alreadyApplied")}
                  </span>
                )}
                <SkillChips skills={job.skills} />
              </div>
            )}
          </div>
        );
      })}
      <More count={more} />
    </div>
  );
}

function CandidateRows({ candidates, more }: { candidates: CandidateRow[]; more: number }) {
  const t = useTranslations("copilot");
  return (
    <div className="space-y-2">
      <ul className="divide-y divide-border rounded-lg border border-border bg-card text-xs">
        {candidates.map((c, index) => {
          const detail = [c.job, c.experienceYears !== undefined ? t("views.years", { count: c.experienceYears }) : null]
            .filter(Boolean)
            .join(" · ");
          return (
            <li key={c.id || `candidate-${index}`} className="flex items-start justify-between gap-2 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{c.name}</p>
                {detail && <p className="mt-0.5 truncate text-muted-foreground">{detail}</p>}
                {c.skills.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <SkillChips skills={c.skills} />
                  </div>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {c.matchScore !== undefined && <MatchBadge score={c.matchScore} />}
                {c.status && <StatusPill status={c.status} />}
              </div>
            </li>
          );
        })}
      </ul>
      <More count={more} />
    </div>
  );
}

function ApplicationRows({ applications, more }: { applications: ApplicationRow[]; more: number }) {
  const t = useTranslations("copilot");
  const locale = useLocale();
  return (
    <div className="space-y-2">
      <ul className="divide-y divide-border rounded-lg border border-border bg-card text-xs">
        {applications.map((a, index) => (
          <li key={`${a.title}-${index}`} className="flex items-start justify-between gap-2 p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{a.title}</p>
              {a.appliedAt && (
                <p className="mt-0.5 text-muted-foreground">
                  {t("views.appliedOn", { date: formatDate(a.appliedAt, { dateStyle: "medium" }, locale) })}
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              {a.matchScore !== undefined && <MatchBadge score={a.matchScore} />}
              {a.status && <StatusPill status={a.status} />}
            </div>
          </li>
        ))}
      </ul>
      <More count={more} />
    </div>
  );
}

function StatsTiles({ tiles, rows }: { tiles: StatTile[]; rows: Array<{ label: string; value: number }> }) {
  const t = useTranslations("copilot");
  const statusLabel = useStatusLabel();
  const max = Math.max(0, ...rows.map((r) => r.value));
  return (
    <div className="space-y-2">
      {tiles.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {tiles.map((tile) => {
            // Literal keys only: a dynamic t() key crashes on a typo instead of failing a test.
            const label =
              "metric" in tile
                ? tile.metric === "total"
                  ? t("views.metric.total")
                  : t("views.metric.overdue")
                : statusLabel(tile.status);
            return (
              <div key={"metric" in tile ? tile.metric : tile.status} className="rounded-lg border border-border bg-card p-2.5">
                <p className="text-lg font-semibold tabular-nums text-foreground">{tile.value}</p>
                <p className="truncate text-xs text-muted-foreground">{label}</p>
              </div>
            );
          })}
        </div>
      )}
      {rows.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-3 text-xs">
          <p className="mb-2 font-medium text-foreground">{t("views.perJob")}</p>
          <ul className="space-y-2">
            {rows.map((row, index) => (
              <li key={`${row.label}-${index}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-foreground">{row.label}</span>
                  <span className="shrink-0 font-medium tabular-nums text-foreground">{row.value}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${max ? (row.value / max) * 100 : 0}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
