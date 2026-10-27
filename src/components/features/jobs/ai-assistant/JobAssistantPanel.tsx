"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, SendHorizontal, Sparkles, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { JobAssistantState } from "./useJobAssistant";

export interface JobAssistantQuickAction {
  label: string;
  instruction: string;
}

interface JobAssistantPanelProps {
  assistant: JobAssistantState;
  quickActions: JobAssistantQuickAction[];
  className?: string;
  /** Rendered inside the small-screen dialog: taller list, header is the dialog's title. */
  inDialog?: boolean;
}

/**
 * The job's AI assistant: a short conversation whose answers are written
 * straight into the form, each with an Undo. Shared by the create wizard,
 * the edit page and the bulk-upload review.
 */
export function JobAssistantPanel({ assistant, quickActions, className, inDialog }: JobAssistantPanelProps) {
  const t = useTranslations("jobAssistant");
  const [input, setInput] = useState("");
  const inputId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const { messages, busy, ask, undo } = assistant;

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length, busy]);

  const send = (text: string) => {
    if (!text.trim() || busy) return;
    setInput("");
    void ask(text);
  };

  return (
    <section
      aria-label={t("title")}
      className={cn("flex flex-col rounded-2xl border border-primary/20 bg-background shadow-sm", className)}
    >
      <header className="flex items-start gap-2 border-b border-border/60 card-pad">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Sparkles className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          {/* In the dialog these are its title and description, read once. */}
          {inDialog ? (
            <>
              <DialogTitle className="text-sm font-semibold text-foreground">{t("title")}</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">{t("subtitle")}</DialogDescription>
            </>
          ) : (
            <>
              <h2 className="text-sm font-semibold text-foreground">{t("title")}</h2>
              <p className="text-xs text-muted-foreground">{t("subtitle")}</p>
            </>
          )}
        </div>
      </header>

      <div
        ref={listRef}
        aria-live="polite"
        className={cn("space-y-2 overflow-y-auto px-3 py-3", inDialog ? "max-h-[50dvh] min-h-40" : "max-h-80 min-h-24")}
      >
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{t("emptyHint")}</p>
            <div className="flex flex-wrap gap-1.5">
              {quickActions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  disabled={busy}
                  onClick={() => send(action.instruction)}
                  className="min-h-9 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/[0.04] disabled:opacity-50"
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[92%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-xs leading-5",
                m.role === "user" && "bg-primary text-primary-foreground",
                m.role === "assistant" && !m.failed && "bg-muted/60 text-foreground",
                m.failed && "border border-destructive/20 bg-destructive/5 text-destructive",
              )}
            >
              {m.content || (m.changed?.length ? t("doneNoReply") : t("noChange"))}
              {m.changed && m.changed.length > 0 && (
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border/60 pt-1.5 text-[11px] text-muted-foreground">
                  <span>{t("updated", { fields: m.changed.map((f) => t(`fields.${f}`)).join(", ") })}</span>
                  {m.undo && (
                    <button
                      type="button"
                      onClick={() => undo(m.id)}
                      className="inline-flex min-h-6 items-center gap-1 font-medium text-primary hover:underline"
                    >
                      <Undo2 className="size-3" aria-hidden="true" />
                      {t("undo")}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            {t("thinking")}
          </div>
        )}
      </div>

      {/* Not a <form>: the panel sits inside the job form, and forms don't nest. */}
      <div className="flex items-end gap-2 border-t border-border/60 p-2">
        <label htmlFor={inputId} className="sr-only">{t("inputLabel")}</label>
        <Textarea
          id={inputId}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder={t("placeholder")}
          maxLength={1000}
          rows={2}
          className="min-h-11 flex-1 resize-none text-sm"
        />
        <Button type="button" size="icon" onClick={() => send(input)} disabled={busy || !input.trim()} aria-label={t("send")} className="size-11 shrink-0">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <SendHorizontal className="size-4 rtl:rotate-180" />}
        </Button>
      </div>
    </section>
  );
}
