"use client";

import { useCallback, useEffect, useRef } from "react";
import { useDraggable } from "@dnd-kit/core";
import { ArrowRight, CalendarClock, CalendarX, CheckCircle2, MapPin, PhoneCall, XCircle } from "lucide-react";
import { formatListDate, formatTime } from "@/lib/ui/intlFormat";
import { cn } from "@/lib/utils";
import { LeadActionsMenu, type LeadActionHandlers, type LeadActionState } from "./LeadActionsMenu";
import {
  CONTACT_METHOD_KEYS, LOST_REASON_KEYS, followUpHasTime, formatMoney, leadValue,
  type Lead, type StageStyle, type T,
} from "./leadShared";

interface LeadCardProps {
  lead: Lead;
  stage: StageStyle;
  exhibitionName?: string;
  actions: LeadActionHandlers;
  state: LeadActionState;
  t: T;
  locale: string;
}

/**
 * A board card answers "who is this and what happens next", and has one main
 * action, Open Lead. Everything else is in the ⋮ menu (owner's brief,
 * 2026-10-02: the old card's three tiny icons said nothing).
 */
export function LeadCard({ lead, stage, exhibitionName, actions, state, t, locale }: LeadCardProps) {
  const value = leadValue(lead);
  const place = [lead.country, lead.industry].filter(Boolean).join(" · ");

  return (
    <div className="group rounded-xl border border-border/60 bg-background p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors hover:border-border">
      <h4 className="truncate text-sm font-semibold leading-tight text-foreground" title={lead.companyName}>
        {lead.companyName}
      </h4>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">{lead.contactPerson}</p>
      {place && (
        <p className="mt-0.5 flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
          <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{place}</span>
        </p>
      )}

      {(exhibitionName || value != null) && (
        <div className="mt-2 flex items-center gap-2">
          {exhibitionName && (
            <span className="min-w-0 truncate rounded bg-primary/5 px-1.5 py-0.5 text-[10px] font-medium text-primary" title={exhibitionName}>
              {exhibitionName}
            </span>
          )}
          {value != null && (
            <span className={cn("ms-auto shrink-0 text-xs font-semibold tabular-nums", stage.color)}>
              {formatMoney(value, lead.expectedRevenueCurrency)}
            </span>
          )}
        </div>
      )}

      <CardStatusLine lead={lead} t={t} locale={locale} />

      {/* Buttons keep their pointer and key events to themselves: the card is
          the drag handle, and Enter on a focused button must press it, not
          pick the card up. */}
      <div
        className="mt-2.5 flex items-center gap-1.5"
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => actions.open(lead)}
          className={cn(
            "inline-flex h-11 min-w-0 flex-1 items-center sm:h-9 justify-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
            stage.bgColor, stage.borderColor, stage.color,
          )}
        >
          <span className="truncate">{t("openLead")}</span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 rtl:rotate-180" aria-hidden="true" />
        </button>
        <LeadActionsMenu lead={lead} actions={actions} state={state} t={t} />
      </div>
    </div>
  );
}

/** One or two lines on where the lead stands: the outcome, or the next step. */
function CardStatusLine({ lead, t, locale }: { lead: Lead; t: T; locale: string }) {
  if (lead.status === "converted") {
    return (
      <p className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-status-selected">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {lead.convertedAt ? t("wonOn", { date: formatListDate(lead.convertedAt, locale) }) : t("stageWon")}
      </p>
    );
  }
  if (lead.status === "lost") {
    return (
      <div className="mt-2 space-y-1">
        {lead.lostReasonCode && (
          <span className="inline-flex rounded bg-status-rejected-bg px-1.5 py-0.5 text-[10px] font-medium text-status-rejected">
            {t(LOST_REASON_KEYS[lead.lostReasonCode])}
          </span>
        )}
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-status-rejected">
          <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {t("lostOn", { date: formatListDate(lead.lostAt ?? lead.updatedAt ?? lead.createdAt, locale) })}
        </p>
      </div>
    );
  }

  const overdue = lead.followUpAt ? new Date(lead.followUpAt) < new Date() : false;
  const nextLabel = lead.followUpNote || (lead.followUpType ? t(CONTACT_METHOD_KEYS[lead.followUpType]) : t("followUpGeneric"));

  return (
    <div className="mt-2 space-y-1 text-[11px]">
      {lead.lastContactedAt && (
        <p className="flex items-center gap-1.5 text-muted-foreground">
          <PhoneCall className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{t("lastContactOn", { date: formatListDate(lead.lastContactedAt, locale) })}</span>
        </p>
      )}
      {lead.followUpAt ? (
        <div className={cn("flex gap-1.5", overdue ? "text-status-rejected" : "text-foreground/80")}>
          <CalendarClock className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="truncate font-medium">{t("nextStep", { step: nextLabel })}</p>
            <p className={cn("truncate", overdue ? "" : "text-muted-foreground")}>
              {formatListDate(lead.followUpAt, locale)}
              {followUpHasTime(lead.followUpAt) && ` · ${formatTime(lead.followUpAt, { hour: "2-digit", minute: "2-digit" }, locale)}`}
              {overdue && ` · ${t("overdue")}`}
            </p>
          </div>
        </div>
      ) : (
        <p className="flex items-center gap-1.5 text-muted-foreground">
          <CalendarX className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {t("noFollowUp")}
        </p>
      )}
    </div>
  );
}

/**
 * The card as a drag source. The whole card is the handle (no grip to aim
 * for), and a click on it opens the workspace — except the click that ends a
 * drag, which is swallowed for a beat.
 */
export function DraggableLeadCard(props: LeadCardProps) {
  const { lead, actions } = props;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lead._id,
    data: { lead },
  });

  const wasDraggingRef = useRef(false);
  const dragEndedAtRef = useRef(0);
  useEffect(() => {
    if (isDragging) { wasDraggingRef.current = true; return; }
    if (wasDraggingRef.current) {
      wasDraggingRef.current = false;
      dragEndedAtRef.current = Date.now();
    }
  }, [isDragging]);

  const handleClick = useCallback(() => {
    if (Date.now() - dragEndedAtRef.current < 250) return;
    actions.open(lead);
  }, [actions, lead]);

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        opacity: isDragging ? 0.35 : 1,
        // Touch drag runs off TouchSensor's long-press, so the column keeps its
        // own vertical scroll; `none` here would have killed it.
        touchAction: "manipulation",
      }}
      className="cursor-grab rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/50 active:cursor-grabbing"
      onClick={handleClick}
      {...attributes}
      {...listeners}
      aria-roledescription={props.t("draggableLead")}
      aria-label={props.t("leadCardLabel", { company: lead.companyName })}
    >
      <LeadCard {...props} />
    </div>
  );
}
