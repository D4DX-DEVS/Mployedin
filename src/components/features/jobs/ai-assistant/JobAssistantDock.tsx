"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { JobAssistantPanel, type JobAssistantQuickAction } from "./JobAssistantPanel";
import type { JobAssistantState } from "./useJobAssistant";

/** Tailwind's `xl` — at and above it the panel sits inline beside the form. */
const INLINE_QUERY = "(min-width: 1280px)";

interface JobAssistantContextValue {
  assistant: JobAssistantState;
  quickActions: JobAssistantQuickAction[];
  /** Sends an instruction from a step's shortcut, opening the dialog on small screens. */
  askFromField: (instruction: string) => void;
  openDialog: () => void;
}

const JobAssistantContext = createContext<JobAssistantContextValue | null>(null);

export function useJobAssistantContext(): JobAssistantContextValue | null {
  return useContext(JobAssistantContext);
}

interface JobAssistantProviderProps {
  assistant: JobAssistantState;
  quickActions: JobAssistantQuickAction[];
  children: ReactNode;
}

/**
 * Holds the job's one assistant for the page: the inline panel (wide screens),
 * the dialog (small screens) and the steps' shortcuts all talk to it.
 */
export function JobAssistantProvider({ assistant, quickActions, children }: JobAssistantProviderProps) {
  const [open, setOpen] = useState(false);

  const openDialog = useCallback(() => setOpen(true), []);
  const askFromField = useCallback((instruction: string) => {
    if (typeof window !== "undefined" && !window.matchMedia(INLINE_QUERY).matches) setOpen(true);
    void assistant.ask(instruction);
  }, [assistant]);

  const value = useMemo(
    () => ({ assistant, quickActions, askFromField, openDialog }),
    [assistant, quickActions, askFromField, openDialog],
  );

  return (
    <JobAssistantContext.Provider value={value}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-lg gap-0 overflow-hidden rounded-2xl p-0">
          <JobAssistantPanel assistant={assistant} quickActions={quickActions} inDialog className="rounded-none border-0 shadow-none" />
        </DialogContent>
      </Dialog>
    </JobAssistantContext.Provider>
  );
}

/** The panel in a page's sidebar; hidden below `xl`, where the dialog takes over. */
export function JobAssistantInline({ className }: { className?: string }) {
  const ctx = useJobAssistantContext();
  if (!ctx) return null;
  return (
    <JobAssistantPanel
      assistant={ctx.assistant}
      quickActions={ctx.quickActions}
      className={cn("hidden xl:flex", className)}
    />
  );
}

/** Opens the assistant dialog; shown only below `xl`. */
export function JobAssistantOpenButton({ className }: { className?: string }) {
  const t = useTranslations("jobAssistant");
  const ctx = useJobAssistantContext();
  if (!ctx) return null;
  return (
    <Button type="button" variant="outline" onClick={ctx.openDialog} className={cn("min-h-11 gap-1.5 xl:hidden", className)}>
      <Sparkles className="size-4 text-primary" aria-hidden="true" />
      {t("open")}
    </Button>
  );
}

/**
 * A step's shortcut into the assistant ("Write the description", "Suggest
 * questions"). It posts into the same conversation; it is not an AI of its own.
 */
export function JobAssistantAskButton({ label, instruction, className }: { label: string; instruction: string; className?: string }) {
  const ctx = useJobAssistantContext();
  if (!ctx) return null;
  return (
    <Button
      type="button"
      variant="outline"
      size="dense"
      disabled={ctx.assistant.busy}
      onClick={() => ctx.askFromField(instruction)}
      className={cn("gap-1.5 text-xs", className)}
    >
      <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
      {label}
    </Button>
  );
}
