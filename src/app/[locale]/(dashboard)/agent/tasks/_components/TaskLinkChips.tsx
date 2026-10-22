"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Briefcase, Building2, UserRound, type LucideIcon } from "lucide-react";
import type { ResolvedTaskLinks } from "@/lib/agentTasks/links";
import { taskLinkHrefs } from "@/lib/agentTasks/linkHrefs";

interface TaskLinkChipsProps {
  locale: string;
  links?: ResolvedTaskLinks;
}

/**
 * The candidate, job and employer a task is about, each a link to the page the
 * agent acts on it from (linkHrefs.ts) — so following up means opening the
 * application, not just changing the task's status.
 */
export function TaskLinkChips({ locale, links }: TaskLinkChipsProps) {
  const t = useTranslations("agentTasks");
  if (!links || (!links.candidate && !links.job && !links.employer)) return null;
  const hrefs = taskLinkHrefs(locale, links);

  const chips: { key: string; icon: LucideIcon; text: string; href?: string; aria: string }[] = [];
  if (links.candidate) {
    chips.push({
      key: "candidate", icon: UserRound, text: links.candidate.name, href: hrefs.candidate,
      aria: links.candidate.applicationId || links.candidate.hasApplications
        ? t("linkOpenCandidateApplication", { name: links.candidate.name })
        : t("linkOpenCandidate", { name: links.candidate.name }),
    });
  }
  if (links.job) {
    chips.push({
      key: "job", icon: Briefcase, text: links.job.title, href: hrefs.job,
      aria: links.job.deleted ? t("linkJobDeleted", { title: links.job.title }) : t("linkOpenJob", { title: links.job.title }),
    });
  }
  if (links.employer) {
    chips.push({ key: "employer", icon: Building2, text: links.employer.name, href: hrefs.employer, aria: t("linkOpenEmployer", { name: links.employer.name }) });
  }

  return (
    <ul className="mt-1.5 flex flex-wrap items-center gap-1.5" aria-label={t("linkedRecords")}>
      {chips.map(({ key, icon: Icon, text, href, aria }) => (
        <li key={key} className="min-w-0 max-w-full">
          {href ? (
            <Link
              href={href}
              aria-label={aria}
              title={aria}
              className="inline-flex min-h-8 max-w-full items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-0.5 text-xs font-medium text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{text}</span>
            </Link>
          ) : (
            <span
              title={aria}
              className="inline-flex min-h-8 max-w-full items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-xs text-muted-foreground line-through"
            >
              <Icon className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{text}</span>
              <span className="sr-only">{aria}</span>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
