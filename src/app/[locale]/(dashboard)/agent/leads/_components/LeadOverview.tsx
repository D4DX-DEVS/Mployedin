"use client";

import { useState, type ReactNode } from "react";
import {
  ArrowRight, BadgeDollarSign, Briefcase, Building2, CalendarCheck2, CalendarClock, CalendarPlus,
  Check, CheckCircle2, CircleUser, ClipboardList, Factory, Loader2, Mail, MapPin, MessageCircle,
  Pencil, Phone, PhoneCall, Target, Users, X, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatListDate, formatTime } from "@/lib/ui/intlFormat";
import { cn } from "@/lib/utils";
import type { LeadActionHandlers } from "./LeadActionsMenu";
import {
  CONTACT_METHOD_KEYS, HIRING_RANGE_KEYS, LOST_REASON_KEYS, STAGES,
  followUpHasTime, formatMoney, isOpenStage, whatsappHref,
  type Lead, type LeadStatus, type StageStyle, type T,
} from "./leadShared";

interface OverviewProps {
  lead: Lead;
  exhibitionName?: string;
  stageConfig: Record<LeadStatus, StageStyle>;
  actions: LeadActionHandlers;
  canUpdate: boolean;
  converting: boolean;
  onLeadChange: (lead: Lead) => void;
  t: T;
  locale: string;
}

/** The workspace's first tab: where the lead stands and what happens next. */
export function LeadOverview(props: OverviewProps) {
  const { lead, actions, canUpdate, converting, t } = props;
  return (
    <div className="space-y-4">
      <StatusSection {...props} />
      {lead.status === "converted" && !lead.convertedToEmployerId && canUpdate && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-status-selected/25 bg-status-selected-bg p-3">
          <Building2 className="h-5 w-5 shrink-0 text-status-selected" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-sm text-foreground">{t("noEmployerAccountYet")}</p>
          <Button size="sm" onClick={() => actions.createAccount(lead)} disabled={converting}>
            {converting && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("createEmployerAccount")}
          </Button>
        </div>
      )}
      <ContactSection {...props} />
      <DetailsSection {...props} />
      <FollowUpSection {...props} />
    </div>
  );
}

function Section({ title, icon, action, children }: { title: string; icon: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border/70 bg-background p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-muted-foreground [&_svg]:h-4 [&_svg]:w-4" aria-hidden="true">{icon}</span>
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function SectionButton({ onClick, icon, children }: { onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick} className="h-8 shrink-0 gap-1.5 px-2.5 text-xs">
      {icon}{children}
    </Button>
  );
}

/** New → Contacted → Interested → Negotiating → Won, with Lost at the end.
 *  Each step is a button that opens the Move dialog on it. */
function StatusSection({ lead, stageConfig, actions, canUpdate, t }: OverviewProps) {
  const currentIndex = STAGES.indexOf(lead.status);
  return (
    <Section
      title={t("leadStatusTitle")}
      icon={<Target />}
      action={canUpdate ? (
        <SectionButton onClick={() => actions.move(lead)} icon={<ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />}>{t("moveStage")}</SectionButton>
      ) : undefined}
    >
      <ol className="flex items-start">
        {STAGES.map((stage, index) => {
          const style = stageConfig[stage];
          const current = stage === lead.status;
          const lostStep = stage === "lost";
          // Lost is a side exit, not a step after Won: it is "done" only when it is the stage.
          const done = !lostStep && lead.status !== "lost" && index < currentIndex;
          const clickable = canUpdate && !current;
          return (
            <li key={stage} className="relative flex min-w-0 flex-1 flex-col items-center">
              {index > 0 && (
                /* From the previous step's centre to this one's: `end-1/2`
                   mirrors on its own in Arabic. */
                <span
                  aria-hidden="true"
                  className={cn("absolute end-1/2 top-3 h-px w-full", done || current ? "bg-primary/50" : "bg-border")}
                />
              )}
              <button
                type="button"
                disabled={!clickable}
                onClick={() => actions.move(lead, stage)}
                aria-current={current ? "step" : undefined}
                aria-label={current ? t("currentStage", { stage: style.label }) : t("moveToStage", { stage: style.label })}
                title={current ? undefined : t("moveToStage", { stage: style.label })}
                // `!min-*-0`: the phone 44px button floor drew these dots as
                // tall ovals; tap-target-box keeps the 44px hit area.
                className={cn(
                  "tap-target-box relative z-10 flex h-6 w-6 !min-h-0 !min-w-0 items-center justify-center rounded-full border-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-default",
                  current && lostStep && "border-status-rejected bg-status-rejected text-white",
                  current && !lostStep && "border-status-selected bg-status-selected text-white",
                  done && "border-primary/60 bg-background text-primary",
                  !current && !done && "border-border bg-background text-muted-foreground/50",
                  clickable && "hover:border-primary",
                )}
              >
                {lostStep ? <X className="h-3 w-3" /> : (current || done) ? <Check className="h-3 w-3" /> : null}
              </button>
              <span className={cn("mt-1.5 w-full truncate px-0.5 text-center text-[10px] sm:text-[11px]", current ? cn("font-semibold", style.color) : "text-muted-foreground")}>
                {style.label}
              </span>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 items-start gap-x-3 gap-y-0.5 py-1.5 text-sm sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <dt className="flex min-w-0 items-center gap-2 text-muted-foreground">
        <span className="shrink-0 [&_svg]:h-4 [&_svg]:w-4" aria-hidden="true">{icon}</span>
        <span className="truncate">{label}</span>
      </dt>
      <dd className="min-w-0 break-words ps-6 font-medium text-foreground sm:ps-0">{children ?? <span className="font-normal text-muted-foreground">—</span>}</dd>
    </div>
  );
}

function ContactSection({ lead, exhibitionName, actions, canUpdate, t }: OverviewProps) {
  const location = [lead.city, lead.country].filter(Boolean).join(", ");
  const source = [lead.source, exhibitionName].filter(Boolean).join(" · ");
  return (
    <Section
      title={t("contactInformationTitle")}
      icon={<CircleUser />}
      action={canUpdate ? <SectionButton onClick={() => actions.edit(lead)} icon={<Pencil className="h-3.5 w-3.5" />}>{t("editAction")}</SectionButton> : undefined}
    >
      <dl className="divide-y divide-border/50">
        <Row icon={<CircleUser />} label={t("fieldContactPerson")}>{lead.contactPerson}</Row>
        <Row icon={<Mail />} label={t("fieldContactEmail")}>
          {lead.contactEmail ? <a href={`mailto:${lead.contactEmail}`} className="text-primary hover:underline">{lead.contactEmail}</a> : null}
        </Row>
        <Row icon={<Phone />} label={t("fieldContactPhone")}>
          {lead.contactPhone ? (
            <span className="inline-flex flex-wrap items-center gap-2">
              <a href={`tel:${lead.contactPhone}`} className="text-primary hover:underline" dir="ltr">{lead.contactPhone}</a>
              <a
                href={whatsappHref(lead.contactPhone)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("whatsappContact", { name: lead.contactPerson })}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-status-selected hover:bg-status-selected-bg"
              >
                <MessageCircle className="h-4 w-4" />
              </a>
            </span>
          ) : null}
        </Row>
        <Row icon={<Building2 />} label={t("fieldCompanyName")}>{lead.companyName}</Row>
        <Row icon={<Factory />} label={t("fieldIndustry")}>{lead.industry || null}</Row>
        <Row icon={<MapPin />} label={t("detailLocation")}>{location || null}</Row>
        <Row icon={<Target />} label={t("detailSource")}>{source || null}</Row>
        <Row icon={<Users />} label={t("assignedTo")}>{lead.assignedAgentName || null}</Row>
      </dl>
    </Section>
  );
}

function DetailsSection({ lead, t, locale }: OverviewProps) {
  const currency = lead.expectedRevenueCurrency;
  return (
    <Section title={t("leadDetailsTitle")} icon={<ClipboardList />}>
      <dl className="divide-y divide-border/50">
        <Row icon={<BadgeDollarSign />} label={t("estimatedValue")}>
          {lead.expectedRevenue != null ? <span className="text-status-selected">{formatMoney(lead.expectedRevenue, currency)}</span> : null}
        </Row>
        <Row icon={<Users />} label={t("moveFieldExpectedHiring")}>{lead.expectedHiring ? t(HIRING_RANGE_KEYS[lead.expectedHiring]) : null}</Row>
        <Row icon={<Briefcase />} label={t("moveFieldRequirement")}>{lead.requirement || null}</Row>
        <Row icon={<PhoneCall />} label={t("lastContactLabel")}>
          {lead.lastContactedAt
            ? `${formatListDate(lead.lastContactedAt, locale)}${lead.lastContactMethod ? ` · ${t(CONTACT_METHOD_KEYS[lead.lastContactMethod])}` : ""}`
            : null}
        </Row>
        <Row icon={<CalendarCheck2 />} label={t("detailCreated")}>{formatListDate(lead.createdAt, locale)}</Row>
        {lead.status === "converted" && (
          <>
            <Row icon={<BadgeDollarSign />} label={t("moveFieldFinalValue")}>
              {lead.wonValue != null ? <span className="text-status-selected">{formatMoney(lead.wonValue, currency)}</span> : null}
            </Row>
            <Row icon={<CheckCircle2 />} label={t("moveFieldWonDate")}>{lead.convertedAt ? formatListDate(lead.convertedAt, locale) : null}</Row>
          </>
        )}
        {lead.status === "lost" && (
          <>
            <Row icon={<XCircle />} label={t("moveFieldLostReason")}>
              {lead.lostReasonCode || lead.lostReason ? (
                <span className="text-status-rejected">
                  {lead.lostReasonCode ? t(LOST_REASON_KEYS[lead.lostReasonCode]) : null}
                  {lead.lostReasonCode && lead.lostReason ? " — " : null}
                  {lead.lostReason}
                </span>
              ) : null}
            </Row>
            <Row icon={<CalendarCheck2 />} label={t("lostDateLabel")}>{lead.lostAt ? formatListDate(lead.lostAt, locale) : null}</Row>
          </>
        )}
      </dl>
    </Section>
  );
}

function FollowUpSection({ lead, actions, canUpdate, onLeadChange, t, locale }: OverviewProps) {
  const [busy, setBusy] = useState<"done" | "clear" | null>(null);
  const open = isOpenStage(lead.status);

  const clear = async (done: boolean) => {
    setBusy(done ? "done" : "clear");
    try {
      const res = await fetch(`/api/leads/${lead._id}/follow-up${done ? "?done=1" : ""}`, { method: "DELETE" });
      if (!res.ok) { toast.error(t("followUpSaveFailed")); return; }
      onLeadChange(await res.json());
      toast.success(done ? t("followUpMarkedDone") : t("followUpCleared"));
    } catch {
      toast.error(t("followUpSaveFailed"));
    } finally {
      setBusy(null);
    }
  };

  const overdue = lead.followUpAt ? new Date(lead.followUpAt) < new Date() : false;

  return (
    <Section
      title={t("nextFollowUpTitle")}
      icon={<CalendarClock />}
      action={canUpdate && open ? (
        <SectionButton onClick={() => actions.followUp(lead)} icon={<CalendarPlus className="h-3.5 w-3.5" />}>
          {lead.followUpAt ? t("rescheduleAction") : t("addFollowUp")}
        </SectionButton>
      ) : undefined}
    >
      {!open ? (
        <div className="flex items-start gap-2.5">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-status-selected" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-status-selected">{t("noFollowUpPending")}</p>
            <p className="text-xs text-muted-foreground">{lead.status === "converted" ? t("leadMarkedWon") : t("leadMarkedLost")}</p>
          </div>
        </div>
      ) : lead.followUpAt ? (
        <div className="space-y-3">
          <div className={cn("rounded-lg border p-3", overdue ? "border-status-rejected/30 bg-status-rejected-bg" : "border-border/60 bg-muted/20")}>
            <p className={cn("text-sm font-semibold", overdue ? "text-status-rejected" : "text-foreground")}>
              {formatListDate(lead.followUpAt, locale)}
              {followUpHasTime(lead.followUpAt) && ` · ${formatTime(lead.followUpAt, { hour: "2-digit", minute: "2-digit" }, locale)}`}
              {overdue && <span className="ms-2 rounded bg-status-rejected px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">{t("overdue")}</span>}
            </p>
            {(lead.followUpType || lead.followUpNote) && (
              <p className="mt-1 text-sm text-muted-foreground">
                {[lead.followUpType ? t(CONTACT_METHOD_KEYS[lead.followUpType]) : null, lead.followUpNote].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
          {canUpdate && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => clear(true)} disabled={busy !== null}>
                {busy === "done" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {t("markFollowUpDone")}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => clear(false)} disabled={busy !== null}>
                {busy === "clear" && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("clearFollowUp")}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t("noFollowUpScheduled")}</p>
      )}
    </Section>
  );
}
