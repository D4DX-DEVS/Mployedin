"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, ChevronDown, Loader2, RefreshCw, RotateCcw, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { csrfFetch } from "@/lib/security/csrf-client";
import { hasCvChanges, type CvAssistantChanges } from "@/lib/ai/cvAssistant";
import { applyCvChanges, revertCvChanges, toAssistantCv } from "@/app/[locale]/(dashboard)/job-seeker/cv/cv-assistant-apply";
import { htmlToPlainText } from "@/app/[locale]/(dashboard)/job-seeker/cv/rich-text";
import { EMPTY_CV_FORM, cvFormFromProfile, type SeekerProfileData } from "@/app/[locale]/(dashboard)/job-seeker/cv/built-cv";
import type { CVForm } from "@/app/[locale]/(dashboard)/job-seeker/cv/types";

/**
 * A small AI chat in the review window: three one-tap fixes or a request in
 * their own words; follow-ups know the turns before. It uses the CV Builder's
 * assistant (/api/ai/cv-assistant), which may change only the summary, skills
 * and job descriptions and never adds titles, dates or facts the CV lacks.
 * Each suggestion waits for Apply; Undo puts back only what it changed; Try
 * again asks for a different answer to the same request.
 */

interface CvReviewAssistantProps {
  profile: SeekerProfileData;
  onChange: (next: SeekerProfileData) => void;
}

type Entry = Record<string, unknown>;

interface Turn {
  id: number;
  role: "user" | "assistant";
  content: string;
  changes?: CvAssistantChanges;
  /** The form before Apply, for Undo; set while the suggestion is applied. */
  before?: CVForm;
  discarded?: boolean;
  error?: boolean;
}

const QUICK = ["grammar", "improve", "shorten"] as const;
const HISTORY_TURNS = 8;

/** The entries with the descriptions the assistant rewrote, as plain text. */
function withDescriptions(list: Entry[] | undefined, before: { description: string }[], after: { description: string }[]): Entry[] | undefined {
  if (!list) return list;
  return list.map((entry, i) =>
    after[i] && before[i] && after[i].description !== before[i].description
      ? { ...entry, description: htmlToPlainText(after[i].description) }
      : entry,
  );
}

export function CvReviewAssistant({ profile, onChange }: CvReviewAssistantProps) {
  const t = useTranslations("easyApply.reviewAi");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  // Closed until asked for: it is help, not a step everyone has to go through.
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const nextId = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);
  // Projects are left out: this window does not save them (cvEditsBody).
  const form = useMemo(() => ({ ...cvFormFromProfile(profile, EMPTY_CV_FORM), projects: [] }), [profile]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [turns.length, busy]);

  // Only what the suggestion changed goes back to the profile.
  const commit = (next: CVForm) => {
    onChange({
      ...profile,
      ...(next.headline !== form.headline ? { summary: next.headline } : {}),
      ...(next.skills !== form.skills ? { skills: next.skills } : {}),
      experience: withDescriptions(profile.experience, form.experience, next.experience),
    });
  };

  /** One request; `earlier` is the chat it follows (without its own answer). */
  const request = async (instruction: string, earlier: Turn[]) => {
    setBusy(true);
    const history = earlier
      .filter((turn) => !turn.error)
      .slice(-HISTORY_TURNS)
      .map((turn) => ({ role: turn.role, content: turn.content.slice(0, 2000) }));
    let reply: Turn;
    try {
      const res = await csrfFetch("/api/ai/cv-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction, history, cv: toAssistantCv(form) }),
      });
      if (!res.ok) {
        reply = { id: nextId.current++, role: "assistant", content: res.status === 429 ? t("errorBusy") : t("errorGeneric"), error: true };
      } else {
        const data = (await res.json()) as { reply: string; changes: CvAssistantChanges };
        const proposes = hasCvChanges(data.changes);
        reply = {
          id: nextId.current++,
          role: "assistant",
          content: data.reply || t("suggestion"),
          ...(proposes ? { changes: data.changes } : {}),
        };
      }
    } catch {
      reply = { id: nextId.current++, role: "assistant", content: t("errorGeneric"), error: true };
    }
    setTurns((prev) => [...prev, reply]);
    setBusy(false);
  };

  const ask = (text: string) => {
    const instruction = text.trim();
    if (!instruction || busy) return;
    const earlier = turns;
    setTurns([...earlier, { id: nextId.current++, role: "user", content: instruction }]);
    setDraft("");
    void request(instruction, earlier);
  };

  /** Try again: drop the last answer (undoing it if applied) and ask the same request anew. */
  const retry = () => {
    const last = turns[turns.length - 1];
    const question = turns[turns.length - 2];
    if (busy || last?.role !== "assistant" || question?.role !== "user") return;
    if (last.before && last.changes) commit(revertCvChanges(form, last.before, last.changes));
    const kept = turns.slice(0, -1);
    setTurns(kept);
    void request(question.content, kept.slice(0, -1));
  };

  const patchTurn = (id: number, patch: Partial<Turn>) =>
    setTurns((prev) => prev.map((turn) => (turn.id === id ? { ...turn, ...patch } : turn)));

  const apply = (turn: Turn) => {
    if (!turn.changes) return;
    commit(applyCvChanges(form, turn.changes));
    patchTurn(turn.id, { before: form, discarded: false });
  };

  const undo = (turn: Turn) => {
    if (!turn.before || !turn.changes) return;
    commit(revertCvChanges(form, turn.before, turn.changes));
    patchTurn(turn.id, { before: undefined });
  };

  const changedParts = (changes: CvAssistantChanges) => [
    ...(changes.summary !== undefined ? [t("partSummary")] : []),
    ...(changes.skills ? [t("partSkills")] : []),
    ...(changes.experience ?? []).map((c) => form.experience[c.index]?.jobTitle || t("partJob")),
  ];

  const lastId = turns[turns.length - 1]?.id;

  return (
    <div className="rounded-xl border border-primary/20 bg-background">
      <button type="button" aria-expanded={open} aria-controls="cv-review-ai" onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-2 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Sparkles className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground">{t("title")}</span>
          {!open && <span className="block text-xs text-muted-foreground">{t("hint")}</span>}
        </span>
        <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {/* Kept mounted while closed, so the chat and any applied change survive a collapse. */}
      <div id="cv-review-ai" hidden={!open} className="space-y-2.5 border-t border-border/70 p-3">
      <div className="flex flex-wrap gap-1.5">
        {QUICK.map((key) => (
          <button key={key} type="button" disabled={busy} onClick={() => ask(t(`prompt.${key}`))}
            className="inline-flex min-h-9 items-center rounded-full border border-primary/20 bg-primary/5 px-3 text-xs font-medium text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
            {t(`quick.${key}`)}
          </button>
        ))}
      </div>

      {(turns.length > 0 || busy) && (
        <div className="max-h-72 space-y-2 overflow-y-auto" aria-live="polite">
          {turns.map((turn) =>
            turn.role === "user" ? (
              <p key={turn.id} className="ms-auto w-fit max-w-[90%] whitespace-pre-wrap break-words rounded-lg bg-primary px-2.5 py-1.5 text-xs text-primary-foreground">
                {turn.content}
              </p>
            ) : (
              <div key={turn.id} className="max-w-[95%] space-y-1.5 rounded-lg bg-muted px-2.5 py-2 text-xs text-foreground">
                <p className={`whitespace-pre-wrap break-words ${turn.error ? "text-destructive" : ""}`}>{turn.content}</p>
                {turn.changes && !turn.discarded && (
                  <>
                    <p className="text-muted-foreground">{t("changes", { parts: changedParts(turn.changes).join(", ") })}</p>
                    {turn.before ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 font-medium text-primary">
                          <Check className="size-3.5" aria-hidden="true" /> {t("applied")}
                        </span>
                        <Button type="button" size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={() => undo(turn)}>
                          <RotateCcw className="size-3.5" aria-hidden="true" /> {t("undo")}
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" className="h-8 gap-1 text-xs" onClick={() => apply(turn)}>
                          <Check className="size-3.5" aria-hidden="true" /> {t("apply")}
                        </Button>
                        <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={() => patchTurn(turn.id, { discarded: true })}>
                          {t("discard")}
                        </Button>
                      </div>
                    )}
                  </>
                )}
                {turn.changes && turn.discarded && <p className="text-muted-foreground">{t("discarded")}</p>}
                {turn.id === lastId && !busy && (
                  <Button type="button" size="sm" variant="ghost" className="h-8 gap-1 px-2 text-xs text-muted-foreground" onClick={retry}>
                    <RefreshCw className="size-3.5" aria-hidden="true" /> {t("retry")}
                  </Button>
                )}
              </div>
            ),
          )}
          {busy && (
            <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> {t("thinking")}
            </p>
          )}
          <div ref={endRef} />
        </div>
      )}

      <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); ask(draft); }}>
        <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={2000} rows={2}
          placeholder={t("placeholder")} aria-label={t("inputLabel")} className="min-h-16 resize-none rounded-xl text-sm" disabled={busy}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); ask(draft); }
          }} />
        <Button type="submit" size="icon" className="size-10 shrink-0 rounded-xl" disabled={busy || !draft.trim()} aria-label={t("send")}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
        </Button>
      </form>
      </div>
    </div>
  );
}
