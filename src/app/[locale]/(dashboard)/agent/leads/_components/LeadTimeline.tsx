"use client";

import { useEffect, useRef, useState } from "react";
import { Clock, Loader2, MessageSquareText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/ui/intlFormat";
import { CONTACT_METHODS, type ContactMethod } from "@/lib/leads/stageRules";
import { ChoiceChips } from "./ChoiceChips";
import {
  ACTIVITY_ICONS, CONTACT_METHOD_KEYS,
  type Lead, type LeadActivity, type LeadStatus, type StageStyle, type T,
} from "./leadShared";

type LoggableAction = ContactMethod | "note";
const LOGGABLE: readonly LoggableAction[] = [...CONTACT_METHODS, "note"];

/**
 * The lead's history (Activity tab) or just its notes (Notes tab), newest
 * first, with a composer on top. Stage moves, logged contacts, finished
 * follow-ups and notes all come from the lead's one activity log.
 */
export function LeadTimeline({
  lead,
  mode,
  autoFocus,
  canWrite,
  onLogged,
  stageConfig,
  t,
  locale,
}: {
  lead: Lead;
  mode: "activity" | "notes";
  autoFocus?: boolean;
  canWrite: boolean;
  onLogged: () => void;
  stageConfig: Record<LeadStatus, StageStyle>;
  t: T;
  locale: string;
}) {
  const [action, setAction] = useState<LoggableAction>(mode === "notes" ? "note" : "call");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus) textRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  const entries = [...(lead.activityLog ?? [])]
    .filter((entry) => mode === "activity" || entry.action === "note")
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const save = async () => {
    const note = text.trim();
    // A note is its text; a logged call can stand without one.
    if (saving || (action === "note" && !note)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${lead._id}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note: note || undefined }),
      });
      if (!res.ok) { toast.error(mode === "notes" ? t("noteSaveFailed") : t("activitySaveFailed")); return; }
      setText("");
      toast.success(mode === "notes" ? t("noteAdded") : t("activityLogged"));
      onLogged();
    } catch {
      toast.error(mode === "notes" ? t("noteSaveFailed") : t("activitySaveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const composerId = `lead-${mode}-composer`;

  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="space-y-2.5 rounded-xl border border-border/70 bg-muted/20 p-3">
          {mode === "activity" && (
            <>
              <p id="lead-activity-type" className="text-xs font-semibold text-muted-foreground">{t("logActivityType")}</p>
              <ChoiceChips
                labelledBy="lead-activity-type"
                choices={LOGGABLE.map((value) => ({
                  value,
                  label: value === "note" ? t("activityNote") : t(CONTACT_METHOD_KEYS[value]),
                  icon: ACTIVITY_ICONS[value],
                }))}
                value={action}
                onChange={setAction}
              />
            </>
          )}
          <Label htmlFor={composerId} className="sr-only">
            {mode === "notes" ? t("addNote") : t("activityNotePlaceholder")}
          </Label>
          <Textarea
            id={composerId}
            ref={textRef}
            rows={3}
            value={text}
            maxLength={2000}
            onChange={(e) => setText(e.target.value)}
            placeholder={mode === "notes" ? t("notePlaceholder") : t("activityNotePlaceholder")}
            className="bg-background"
          />
          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={save} disabled={saving || (action === "note" && !text.trim())}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "notes" ? t("addNote") : t("logActivity")}
            </Button>
          </div>
        </div>
      )}

      {mode === "notes" && lead.notes && (
        <article className="rounded-xl border border-border/60 bg-background p-3">
          <p className="text-xs font-semibold text-muted-foreground">{t("notesFromCreation")}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{lead.notes}</p>
        </article>
      )}

      {entries.length === 0 && !(mode === "notes" && lead.notes) ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          {mode === "notes"
            ? <MessageSquareText className="h-8 w-8 text-muted-foreground/40" aria-hidden="true" />
            : <Clock className="h-8 w-8 text-muted-foreground/40" aria-hidden="true" />}
          <p className="text-sm text-muted-foreground">{mode === "notes" ? t("noNotesYet") : t("noActivityYet")}</p>
        </div>
      ) : (
        <ol className="relative space-y-3 before:absolute before:inset-y-2 before:start-4 before:w-px before:bg-border/70">
          {entries.map((entry, index) => (
            <TimelineEntry key={`${entry.timestamp}-${index}`} entry={entry} stageConfig={stageConfig} t={t} locale={locale} />
          ))}
        </ol>
      )}
    </div>
  );
}

/** Moves Copilot logged before the stage route existed read
 *  "status_changed:new->contacted"; show them as the moves they were. */
function normalizeEntry(entry: LeadActivity): LeadActivity {
  const legacy = /^status_changed:(\w+)->(\w+)$/.exec(entry.action);
  if (!legacy) return entry;
  return { ...entry, action: "stage_change", fromStatus: legacy[1] as LeadStatus, toStatus: legacy[2] as LeadStatus };
}

function TimelineEntry({ entry: raw, stageConfig, t, locale }: {
  entry: LeadActivity;
  stageConfig: Record<LeadStatus, StageStyle>;
  t: T;
  locale: string;
}) {
  const entry = normalizeEntry(raw);
  const Icon = ACTIVITY_ICONS[entry.action] ?? Clock;
  const title = activityTitle(entry, stageConfig, t);
  // The conversion entry's note is server-written English; its title says it.
  const note = entry.action === "converted_to_employer" ? undefined : entry.note;
  return (
    <li className="relative flex gap-3">
      <span className="z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 rounded-xl border border-border/60 bg-background px-3 py-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <time dateTime={entry.timestamp} className="text-[11px] text-muted-foreground">
            {formatDateTime(entry.timestamp, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }, locale)}
          </time>
        </div>
        {note && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{note}</p>}
      </div>
    </li>
  );
}

function activityTitle(entry: LeadActivity, stageConfig: Record<LeadStatus, StageStyle>, t: T): string {
  if (entry.action === "stage_change" && entry.toStatus) {
    const to = stageConfig[entry.toStatus]?.label ?? entry.toStatus;
    const from = entry.fromStatus ? stageConfig[entry.fromStatus]?.label : undefined;
    return from ? t("activityMoved", { from, to }) : t("activityMovedTo", { to });
  }
  if (entry.action === "note") return t("activityNote");
  if (entry.action === "created") return t("detailCreated");
  if (entry.action === "follow_up") return t("activityFollowUp");
  if (entry.action === "converted_to_employer") return t("activityAccountCreated");
  if (entry.action in CONTACT_METHOD_KEYS) return t(CONTACT_METHOD_KEYS[entry.action as ContactMethod]);
  return t("activityOther");
}
