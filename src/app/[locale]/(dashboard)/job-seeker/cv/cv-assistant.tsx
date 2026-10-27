"use client";

/* ── CV assistant ──
   One chat for the whole CV, replacing the Improve / Suggest / Grammar /
   Shorten chips that sat under each text field (client sheet 2026-10-27).
   The assistant proposes; nothing changes until the seeker selects Apply, and
   an applied turn can be undone. Manual editing and the live preview are
   untouched — Apply writes into the same form state they read.
*/

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Loader2, RotateCcw, Send, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { csrfFetch } from "@/lib/security/csrf-client";
import { cn } from "@/lib/utils";
import { hasCvChanges, type CvAssistantChanges } from "@/lib/ai/cvAssistant";
import { applyCvChanges, revertCvChanges, toAssistantCv } from "./cv-assistant-apply";
import type { CVForm } from "./types";

type Status = "proposed" | "applied" | "discarded";

interface Turn {
  id: number;
  role: "user" | "assistant";
  content: string;
  changes?: CvAssistantChanges;
  status?: Status;
  /** The form as it was before Apply; Undo restores only the fields this turn changed. */
  before?: CVForm;
  error?: boolean;
}

interface CvAssistantProps {
  form: CVForm;
  onChange: (next: CVForm) => void;
}

const SUGGESTIONS = ["improve", "grammar", "shorten", "tailor"] as const;

export function CvAssistant({ form, onChange }: CvAssistantProps) {
  const t = useTranslations("cvBuilderPage.assistant");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const nextId = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [turns.length, busy]);

  const send = async (text: string) => {
    const instruction = text.trim();
    if (!instruction || busy) return;
    const history = turns
      .filter((turn) => !turn.error)
      .slice(-8)
      .map((turn) => ({ role: turn.role, content: turn.content.slice(0, 2000) }));
    setTurns((prev) => [...prev, { id: nextId.current++, role: "user", content: instruction }]);
    setDraft("");
    setBusy(true);
    try {
      const res = await csrfFetch("/api/ai/cv-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction, history, cv: toAssistantCv(form) }),
      });
      if (!res.ok) {
        const message = res.status === 429 ? t("errorBusy") : t("errorGeneric");
        setTurns((prev) => [...prev, { id: nextId.current++, role: "assistant", content: message, error: true }]);
        return;
      }
      const data = (await res.json()) as { reply: string; changes: CvAssistantChanges };
      const proposes = hasCvChanges(data.changes);
      setTurns((prev) => [
        ...prev,
        {
          id: nextId.current++,
          role: "assistant",
          content: data.reply || t("proposalReady"),
          ...(proposes ? { changes: data.changes, status: "proposed" as const } : {}),
        },
      ]);
    } catch {
      setTurns((prev) => [...prev, { id: nextId.current++, role: "assistant", content: t("errorGeneric"), error: true }]);
    } finally {
      setBusy(false);
    }
  };

  const setStatus = (id: number, status: Status, before?: CVForm) =>
    setTurns((prev) => prev.map((turn) => (turn.id === id ? { ...turn, status, ...(before ? { before } : {}) } : turn)));

  const apply = (turn: Turn) => {
    if (!turn.changes) return;
    onChange(applyCvChanges(form, turn.changes));
    setStatus(turn.id, "applied", form);
  };

  const undo = (turn: Turn) => {
    if (!turn.before || !turn.changes) return;
    onChange(revertCvChanges(form, turn.before, turn.changes));
    setStatus(turn.id, "proposed");
  };

  const changeRows = (changes: CvAssistantChanges) => [
    ...(changes.summary ? [{ key: "summary", label: t("changeSummary"), text: changes.summary }] : []),
    ...(changes.skills ? [{ key: "skills", label: t("changeSkills"), text: changes.skills.join(", ") }] : []),
    ...(changes.experience ?? []).map((c) => {
      const e = form.experience[c.index];
      return { key: `e${c.index}`, label: t("changeExperience", { role: [e?.jobTitle, e?.company].filter(Boolean).join(" · ") || `#${c.index + 1}` }), text: c.description };
    }),
    ...(changes.projects ?? []).map((c) => ({
      key: `p${c.index}`,
      label: t("changeProject", { title: form.projects[c.index]?.title || `#${c.index + 1}` }),
      text: c.description,
    })),
  ];

  return (
    <div className="card-base panel-body flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Sparkles className="size-5 text-primary" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-sm font-semibold">{t("title")}</h2>
          <p className="text-xs text-muted-foreground">{t("description")}</p>
        </div>
      </div>

      <div className="flex max-h-[32rem] min-h-40 flex-col gap-3 overflow-y-auto rounded-xl border border-border/70 bg-muted/20 p-3" aria-live="polite">
        {turns.length === 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{t("emptyHint")}</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => (key === "tailor" ? setDraft(t("suggestionTailorPrefix")) : void send(t(`suggestion.${key}`)))}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 text-xs font-medium text-primary hover:bg-primary/10"
                >
                  {t(`suggestionLabel.${key}`)}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((turn) => (
          <div key={turn.id} className={cn("flex", turn.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[90%] rounded-2xl px-3 py-2 text-sm",
                turn.role === "user" ? "bg-primary text-primary-foreground" : "border border-border/70 bg-card text-foreground",
                turn.error && "border-destructive/30 text-destructive",
              )}
            >
              <p className="whitespace-pre-wrap break-words">{turn.content}</p>
              {turn.changes && (
                <div className="mt-2 space-y-2">
                  <ul className="space-y-1.5">
                    {changeRows(turn.changes).map((row) => (
                      <li key={row.key} className="rounded-lg bg-muted/50 px-2.5 py-1.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{row.label}</p>
                        <p className="mt-0.5 line-clamp-4 whitespace-pre-wrap text-xs">{row.text}</p>
                      </li>
                    ))}
                  </ul>
                  {turn.status === "proposed" && (
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" className="h-9 gap-1.5" onClick={() => apply(turn)}>
                        <Check className="size-4" aria-hidden="true" /> {t("apply")}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" className="h-9 gap-1.5" onClick={() => setStatus(turn.id, "discarded")}>
                        <X className="size-4" aria-hidden="true" /> {t("discard")}
                      </Button>
                    </div>
                  )}
                  {turn.status === "applied" && (
                    <div className="flex flex-wrap items-center gap-2 text-xs text-emerald-700">
                      <Check className="size-4" aria-hidden="true" /> {t("applied")}
                      <Button type="button" size="sm" variant="ghost" className="h-8 gap-1.5" onClick={() => undo(turn)}>
                        <RotateCcw className="size-3.5" aria-hidden="true" /> {t("undo")}
                      </Button>
                    </div>
                  )}
                  {turn.status === "discarded" && <p className="text-xs text-muted-foreground">{t("discarded")}</p>}
                </div>
              )}
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> {t("thinking")}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="space-y-2">
        <Textarea
          aria-label={t("inputLabel")}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(draft);
            }
          }}
          placeholder={t("placeholder")}
          rows={5}
          maxLength={4000}
          className="min-h-32 resize-y"
        />
        <div className="flex justify-end">
          <Button type="button" onClick={() => void send(draft)} disabled={busy || !draft.trim()} className="min-h-11">
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4 rtl:-scale-x-100" aria-hidden="true" />}
            {t("send")}
          </Button>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">{t("privacyNote")}</p>
    </div>
  );
}
