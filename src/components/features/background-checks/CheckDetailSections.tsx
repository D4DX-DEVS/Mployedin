"use client";

import { useLocale, useTranslations } from "next-intl";
import { CheckCircle2, Circle, History, Mail, Phone, Users, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/ui/intlFormat";
import { cn } from "@/lib/utils";
import { CHECK_OUTCOMES, type CheckHistoryEntry, type CheckRecord, type CheckReference, type ReferenceStatus } from "./checkDetailTypes";

interface SectionProps {
  icon: LucideIcon;
  title: string;
  /** Beside the heading, e.g. a save state. */
  aside?: React.ReactNode;
  children: React.ReactNode;
}

export function Section({ icon: Icon, title, aside, children }: SectionProps) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

interface ProgressProps {
  check: Pick<CheckRecord, "status" | "checkType" | "references">;
  findingsWritten: boolean;
}

/**
 * Where an open check stands, as the steps the holder works through. The
 * referee step only appears on checks that have referees; it is done once
 * one has replied (what "Clear" needs) or every referee has answered.
 */
export function CheckProgressSteps({ check, findingsWritten }: ProgressProps) {
  const t = useTranslations("backgroundCheckWork");
  const refs = check.references ?? [];
  const responded = refs.filter((r) => r.status === "responded").length;
  const answered = refs.filter((r) => r.status === "responded" || r.status === "declined").length;
  const steps: { key: string; label: string; detail?: string; done: boolean }[] = [
    { key: "start", label: t("steps.start"), done: check.status !== "pending" },
    ...(refs.length > 0
      ? [{
          key: "referees",
          label: t("steps.referees"),
          detail: t("stepReferees", { responded, total: refs.length }),
          done: responded > 0 || answered === refs.length,
        }]
      : []),
    { key: "findings", label: t("steps.findings"), done: findingsWritten },
    { key: "result", label: t("steps.result"), done: check.status === "completed" },
  ];
  return (
    <section aria-label={t("steps.title")} className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5">
      <ol className="grid gap-2 sm:grid-flow-col sm:auto-cols-fr">
        {steps.map((step) => (
          <li key={step.key} className="flex items-start gap-1.5 text-xs">
            {step.done ? (
              <CheckCircle2 className="mt-px h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
            ) : (
              <Circle className="mt-px h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden="true" />
            )}
            <span className="min-w-0">
              <span className={cn("block font-medium", step.done ? "text-foreground" : "text-muted-foreground")}>{step.label}</span>
              {step.detail && <span className="block text-muted-foreground">{step.detail}</span>}
              <span className="sr-only">{step.done ? t("stepDone") : t("stepTodo")}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

const REF_TONE: Record<ReferenceStatus, string> = {
  pending: "border-border bg-muted/40 text-muted-foreground",
  requested: "border-sky-500/30 bg-sky-500/10 text-sky-700",
  responded: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
  declined: "border-rose-500/30 bg-rose-500/10 text-rose-700",
};

interface ReferencesProps {
  references: CheckReference[];
  /** Only the person holding the check records referee answers. */
  editable: boolean;
  pending: string | null;
  onStatus: (index: number, status: ReferenceStatus) => void;
  onFeedback: (index: number, feedback: string) => void;
}

/** The holder's next move for one referee; a reply still needs what they said written down. */
function nextStep(ref: CheckReference): "pending" | "requested" | "respondedNoFeedback" | null {
  if (ref.status === "pending") return "pending";
  if (ref.status === "requested") return "requested";
  if (ref.status === "responded" && !ref.feedback?.trim()) return "respondedNoFeedback";
  return null;
}

export function ReferencesSection({ references, editable, pending, onStatus, onFeedback }: ReferencesProps) {
  const t = useTranslations("backgroundCheckWork");
  const locale = useLocale();
  return (
    <Section icon={Users} title={t("referencesTitle", { count: references.length })}>
      <ul className="space-y-2">
        {references.map((ref, i) => (
          <li key={i} className="space-y-2 rounded-xl border border-border/70 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="break-words text-sm font-medium text-foreground">{ref.name}</p>
                {(ref.relationship || ref.company) && (
                  <p className="break-words text-xs text-muted-foreground">{[ref.relationship, ref.company].filter(Boolean).join(" · ")}</p>
                )}
              </div>
              <Badge variant="outline" className={cn("shrink-0", REF_TONE[ref.status])}>{t(`refStatus.${ref.status}`)}</Badge>
            </div>
            {(ref.email || ref.phone) && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                {ref.email && (
                  <a href={`mailto:${ref.email}`} className="inline-flex min-w-0 items-center gap-1 break-all text-primary hover:underline">
                    <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {ref.email}
                  </a>
                )}
                {ref.phone && (
                  <a href={`tel:${ref.phone}`} className="inline-flex items-center gap-1 text-primary hover:underline" dir="ltr">
                    <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {ref.phone}
                  </a>
                )}
              </div>
            )}
            {ref.status === "responded" && ref.respondedAt && (
              <p className="text-xs text-muted-foreground">
                {t("refRepliedOn", { date: formatDateTime(ref.respondedAt, { dateStyle: "medium" }, locale) })}
              </p>
            )}
            {editable ? (
              <>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("refStatusLabel", { name: ref.name })}>
                  {(["requested", "responded", "declined"] as const).map((status) => (
                    <Button
                      key={status}
                      type="button"
                      size="sm"
                      variant={ref.status === status ? "default" : "outline"}
                      aria-pressed={ref.status === status}
                      disabled={pending !== null}
                      className="min-h-11 rounded-lg text-xs sm:min-h-8"
                      onClick={() => ref.status !== status && onStatus(i, status)}
                    >
                      {t(`refStatus.${status}`)}
                    </Button>
                  ))}
                </div>
                {nextStep(ref) && <p className="text-xs text-muted-foreground">{t(`refNextStep.${nextStep(ref)}`)}</p>}
                <label className="sr-only" htmlFor={`ref-feedback-${i}`}>{t("feedbackLabel", { name: ref.name })}</label>
                <Textarea
                  id={`ref-feedback-${i}`}
                  key={`${i}-${ref.feedback ?? ""}`}
                  defaultValue={ref.feedback}
                  placeholder={t("feedbackPlaceholder")}
                  className="min-h-16 text-sm"
                  onBlur={(e) => {
                    if (e.target.value.trim() !== (ref.feedback ?? "")) onFeedback(i, e.target.value);
                  }}
                />
              </>
            ) : ref.feedback ? (
              <p className="whitespace-pre-line break-words rounded-lg bg-muted/40 px-3 py-2 text-sm text-foreground/90">{ref.feedback}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </Section>
  );
}

const KIND_KEY = { agent: "kindAgent", employer: "kindTeam", staff: "kindStaff", system: "kindSystem" } as const;

function historyLine(entry: CheckHistoryEntry, t: ReturnType<typeof useTranslations>): string {
  const name = entry.actor.name || t("someone");
  const meta = entry.meta;
  switch (entry.action) {
    case "create":
      return t("history.create", { name });
    case "start":
      return meta.claimed ? t("history.startClaimed", { name }) : t("history.start", { name });
    case "progress": {
      const number = typeof meta.referenceIndex === "number" ? meta.referenceIndex + 1 : null;
      if (number !== null && typeof meta.referenceStatus === "string") {
        return t("history.progressReference", { name, number, status: t(`refStatus.${meta.referenceStatus}`) });
      }
      if (number !== null) return t("history.progressFeedback", { name, number });
      return t("history.progressResults", { name });
    }
    case "complete": {
      const outcome = (CHECK_OUTCOMES as readonly string[]).includes(String(meta.outcome)) ? t(`outcome.${meta.outcome}`) : "";
      return t("history.complete", { name, outcome });
    }
    case "assign":
      return meta.to ? t("history.assign", { name, to: String(meta.toName || t("someone")) }) : t("history.unassign", { name });
    case "cancel":
      return t("history.cancel", { name });
    case "notes":
      return t("history.notes", { name });
    case "verify":
      return t("history.verify", { name });
    default:
      return t("history.update", { name });
  }
}

export function HistorySection({ history }: { history: CheckHistoryEntry[] }) {
  const t = useTranslations("backgroundCheckWork");
  const locale = useLocale();
  return (
    <Section icon={History} title={t("historyTitle")}>
      {history.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("historyEmpty")}</p>
      ) : (
        <ol className="space-y-3 border-s border-border ps-4">
          {[...history].reverse().map((entry) => (
            <li key={entry.id} className="relative">
              <span className="absolute -start-[21px] top-1.5 size-2.5 rounded-full border-2 border-background bg-primary" aria-hidden="true" />
              <p className="break-words text-sm text-foreground">
                {historyLine(entry, t)}
                <span className="text-muted-foreground"> · {t(KIND_KEY[entry.actor.kind])}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(entry.at, { dateStyle: "medium", timeStyle: "short" }, locale)}
              </p>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}
