"use client";

import { useLocale, useTranslations } from "next-intl";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { cn } from "@/lib/utils";
import { applicationNumberLocale, formatApplicationDate } from "@/lib/jobSeeker/applicationFormat";
import type { TimelineEvent } from "@/lib/jobSeeker/applicationTimeline";

/**
 * The dated trail of what happened to the application, oldest first, with the
 * current stage marked — the "application status" view LinkedIn, Indeed and
 * Naukri give applicants, including when the employer opened it.
 */
export function ApplicationTimeline({ events }: { events: TimelineEvent[] }) {
  const t = useTranslations("applicationDetail");
  const locale = useLocale();

  const label = (event: TimelineEvent) => {
    if (event.kind === "viewed") return t("events.viewed");
    switch (event.status) {
      case "applied": return t("events.applied");
      case "shortlisted": return t("events.shortlisted");
      case "interview_scheduled": return t("events.interview_scheduled");
      case "selected": return t("events.selected");
      case "offer": return t("events.offer");
      case "hired": return t("events.hired");
      case "rejected": return t("events.rejected");
      case "withdrawn": return t("events.withdrawn");
      default: return <StatusBadge status={event.status ?? ""} />;
    }
  };

  const timeOf = (iso: string) =>
    new Date(iso).toLocaleTimeString(applicationNumberLocale(locale), { hour: "numeric", minute: "2-digit" });

  return (
    <section className="card-base rounded-2xl border panel-body" aria-labelledby="application-progress-heading">
      <h2 id="application-progress-heading" className="heading-section font-semibold">
        {t("progressTitle")}
      </h2>
      <ol className="mt-4">
        {events.map((event, i) => {
          const last = i === events.length - 1;
          return (
            <li
              key={`${event.kind}-${event.status ?? ""}-${event.at}`}
              className={cn("relative flex gap-3", !last && "pb-5")}
              aria-current={event.current ? "step" : undefined}
            >
              {!last && <span aria-hidden="true" className="absolute start-[6px] top-4 bottom-0 w-px bg-border" />}
              <span
                aria-hidden="true"
                className={cn(
                  "relative mt-1 size-3.5 shrink-0 rounded-full border-2",
                  event.current ? "border-primary bg-primary ring-4 ring-primary/15" : "border-muted-foreground/40 bg-card",
                )}
              />
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm text-foreground", event.current && "font-semibold")}>
                  {label(event)}
                  {event.current && <span className="sr-only"> ({t("currentStage")})</span>}
                </p>
                <time dateTime={event.at} className="text-xs text-muted-foreground tabular-nums">
                  {formatApplicationDate(event.at, locale, { withYear: true })} · {timeOf(event.at)}
                </time>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
