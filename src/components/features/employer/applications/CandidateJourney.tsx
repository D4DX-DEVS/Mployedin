"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { CalendarDays, ChevronDown, FileText, ShieldCheck, UserCheck, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCandidateJourney } from "@/hooks/useCandidateJourney";

interface CandidateJourneyProps {
  applicationId: string;
  locale: string;
}

const OUTCOME_KEY: Record<string, string> = { passed: "outcomePassed", failed: "outcomeFailed", hold: "outcomeHold", no_show: "outcomeNoShow" };
const INTERVIEW_KEY: Record<string, string> = { scheduled: "interviewScheduled", confirmed: "interviewConfirmed", completed: "interviewCompleted", cancelled: "interviewCancelled", rescheduled: "interviewRescheduled" };
const OFFER_KEY: Record<string, string> = { pending: "offerPending", accepted: "offerAccepted", declined: "offerDeclined", expired: "offerExpired", withdrawn: "offerWithdrawn", countered: "offerCountered" };
const CHECK_KEY: Record<string, string> = { pending: "checkPending", in_progress: "checkInProgress", completed: "checkCompleted", cancelled: "checkCancelled" };
const PLACEMENT_KEY: Record<string, string> = { active: "placementActive", completed: "placementCompleted", terminated: "placementTerminated" };

function humanize(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Candidate journey under the stage stepper in the application drawer:
 * Interviews (per round) · Offer · Background check · Placement.
 * Phones: collapsed behind a toggle (A5); from `md` always visible.
 * Always two columns: the drawer is ~560px wide even on desktop, four columns truncated every line.
 */
export function CandidateJourney({ applicationId, locale }: CandidateJourneyProps) {
  const t = useTranslations("employerJobWorkspace");
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useCandidateJourney(applicationId);
  const dateLocale = locale === "ar" ? "ar" : "en-US";
  const fmt = (v?: string) => (v ? new Date(v).toLocaleDateString(dateLocale, { month: "short", day: "numeric" }) : "");
  const label = (map: Record<string, string>, value?: string) => (value ? (map[value] ? t(map[value]) : humanize(value)) : "");

  const interviewLines = (data?.interviews ?? []).map((iv) => {
    const state = iv.status === "completed" && iv.outcome ? label(OUTCOME_KEY, iv.outcome) : label(INTERVIEW_KEY, iv.status);
    return { id: iv._id, text: [t("journeyRound", { round: iv.interviewRound ?? 1 }), state, fmt(iv.scheduledAt)].filter(Boolean).join(" · ") };
  });
  const offerText = data?.offer
    ? [label(OFFER_KEY, data.offer.status), data.offer.status === "pending" && data.offer.expiresAt ? t("journeyExpires", { date: fmt(data.offer.expiresAt) }) : null].filter(Boolean).join(" · ")
    : t("journeyNoOffer");
  const checkText = data?.check
    ? [label(CHECK_KEY, data.check.status), data.check.references?.length ? t("hiresReferences", { done: data.check.references.filter((r) => r.status === "responded").length, total: data.check.references.length }) : null].filter(Boolean).join(" · ")
    : t("journeyNoCheck");
  const placementText = data?.placement
    ? [label(PLACEMENT_KEY, data.placement.status ?? "active"), data.placement.startDate ? t("hiresStart", { date: fmt(data.placement.startDate) }) : null].filter(Boolean).join(" · ")
    : t("journeyNoPlacement");

  // The check tile used to be a dead label: it reported "not requested" with no
  // way to request one, while the only entry point sat in an overflow menu.
  // Two different destinations behind one tile: with a check on record, open
  // that record (`checkId`); without one, open the request form preselected to
  // this candidate (`applicationId`). Sending "View check" to `applicationId`
  // would open the create form instead — offering to raise a second check.
  const checkHref = data?.check
    ? `/${locale}/employer/background-checks?checkId=${data.check._id}`
    : `/${locale}/employer/background-checks?applicationId=${applicationId}`;

  const cells: {
    key: string;
    Icon: LucideIcon;
    title: string;
    lines: { id: string; text: string }[];
    done: boolean;
    action?: { href: string; label: string };
  }[] = [
    { key: "interviews", Icon: CalendarDays, title: t("journeyInterviews"), lines: interviewLines.length ? interviewLines : [{ id: "none", text: t("journeyNoInterviews") }], done: interviewLines.length > 0 },
    { key: "offer", Icon: FileText, title: t("journeyOffer"), lines: [{ id: "offer", text: offerText }], done: Boolean(data?.offer) },
    {
      key: "check",
      Icon: ShieldCheck,
      title: t("journeyCheck"),
      lines: [{ id: "check", text: checkText }],
      done: Boolean(data?.check),
      action: { href: checkHref, label: data?.check ? t("journeyCheckView") : t("journeyCheckRequest") },
    },
    { key: "placement", Icon: UserCheck, title: t("journeyPlacement"), lines: [{ id: "placement", text: placementText }], done: Boolean(data?.placement) },
  ];

  return (
    <section aria-label={t("journeyTitle")} className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary md:hidden"
      >
        {open ? t("journeyHide") : t("journeyShow")}
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      <div className={cn("grid grid-cols-2 gap-2", !open && "hidden md:grid")} aria-busy={isLoading || undefined}>
        {cells.map(({ key, Icon, title, lines, done, action }) => (
          <div key={key} className={cn("min-w-0 rounded-xl border px-3 py-2", done ? "border-border bg-background" : "border-dashed border-border/70 bg-muted/20")}>
            <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              <Icon className={cn("h-3.5 w-3.5", done ? "text-status-selected" : "text-muted-foreground")} aria-hidden /> {title}
            </p>
            {isLoading ? (
              <div className="mt-1 h-4 w-3/4 animate-pulse rounded bg-muted/60" />
            ) : (
              <>
                <ul className="mt-0.5 space-y-0.5 text-xs text-foreground">
                  {lines.map((line) => <li key={line.id} className="truncate">{line.text}</li>)}
                </ul>
                {action ? (
                  <Link
                    href={action.href}
                    className="mt-1 inline-flex min-h-11 items-center text-xs font-medium text-primary underline-offset-2 hover:underline sm:min-h-0"
                  >
                    {action.label}
                  </Link>
                ) : null}
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
