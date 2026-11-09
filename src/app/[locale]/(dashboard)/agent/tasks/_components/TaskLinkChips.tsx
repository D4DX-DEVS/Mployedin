"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Briefcase, Building2, ChevronDown, Mail, MessageCircle, MessageSquare, Phone, UserRound, type LucideIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
          {key === "employer" && href && links.employer ? (
            <EmployerContactMenu locale={locale} employer={links.employer} jobsHref={href} aria={aria} />
          ) : href ? (
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

const CHIP_CLASS =
  "inline-flex min-h-8 max-w-full items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-0.5 text-xs font-medium text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** wa.me wants the number in international form, digits only. */
const whatsappHref = (phone: string) => `https://wa.me/${phone.replace(/[^\d]/g, "")}`;

/**
 * The employer chip opens a menu: the contact details from the employer's
 * profile, ways to reach them, and their jobs (what the chip used to open).
 */
function EmployerContactMenu({
  locale,
  employer,
  jobsHref,
  aria,
}: {
  locale: string;
  employer: NonNullable<ResolvedTaskLinks["employer"]>;
  jobsHref: string;
  aria: string;
}) {
  const t = useTranslations("agentTasks");
  const { name, email, phone, userId } = employer;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={CHIP_CLASS} aria-label={t("employerMenuLabel", { name })} title={t("employerMenuLabel", { name })}>
          <Building2 className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{name}</span>
          <ChevronDown className="size-3 shrink-0 opacity-70" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="space-y-0.5 normal-case tracking-normal">
          <span className="block truncate text-sm text-foreground">{name}</span>
          {email ? <span className="block break-all text-xs font-normal text-muted-foreground" dir="ltr">{email}</span> : null}
          {phone ? <span className="block break-all text-xs font-normal text-muted-foreground" dir="ltr">{phone}</span> : null}
          {!email && !phone ? <span className="block text-xs font-normal text-muted-foreground">{t("employerNoContact")}</span> : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {userId ? (
          <DropdownMenuItem asChild>
            <Link href={`/${locale}/agent/messages?newChat=${userId}`}><MessageSquare className="h-4 w-4" />{t("employerMessage")}</Link>
          </DropdownMenuItem>
        ) : null}
        {email ? (
          <DropdownMenuItem asChild>
            <a href={`mailto:${email}`}><Mail className="h-4 w-4" />{t("employerEmail")}</a>
          </DropdownMenuItem>
        ) : null}
        {phone ? (
          <>
            <DropdownMenuItem asChild>
              <a href={`tel:${phone}`}><Phone className="h-4 w-4" />{t("employerCall")}</a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={whatsappHref(phone)} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-4 w-4" />{t("employerWhatsapp")}</a>
            </DropdownMenuItem>
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={jobsHref} aria-label={aria}><Briefcase className="h-4 w-4" />{t("employerViewJobs")}</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
