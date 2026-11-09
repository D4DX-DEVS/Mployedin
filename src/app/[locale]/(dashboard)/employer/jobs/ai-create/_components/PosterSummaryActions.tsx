"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { FileText } from "lucide-react";
import { PosterTextDialog } from "@/components/features/jobs/ai-assistant/PosterTextDialog";
import { summarizeDraft } from "./posterSummary";
import type { ExtractedJob } from "./extractedJob";

interface PosterSummaryActionsProps {
  job: ExtractedJob;
  posterText: string | null;
  disabled: boolean;
  /** Sends the request to the chat, which edits this draft. */
  onAsk: (instruction: string) => void;
}

/**
 * Under the message shown after a poster upload: a one-tap request for each
 * part the draft still lacks, and the text the AI read from the poster.
 * Read from the draft as it is now, so a request disappears once it is filled.
 */
export function PosterSummaryActions({ job, posterText, disabled, onAsk }: PosterSummaryActionsProps) {
  const t = useTranslations("ai.jobCreator.posterSummary");
  const [open, setOpen] = useState(false);
  const { missing } = summarizeDraft(job);

  if (!missing.length && !posterText) return null;

  return (
    <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-border/60 pt-2.5">
      {missing.map((key) => (
        <button
          key={key}
          type="button"
          disabled={disabled}
          onClick={() => onAsk(t(`ask.${key}.instruction`))}
          className="min-h-9 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          {t(`ask.${key}.label`)}
        </button>
      ))}
      {posterText && (
        <>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-2 py-1.5 text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <FileText className="size-3.5" aria-hidden="true" />
            {t("viewPosterText")}
          </button>
          <PosterTextDialog open={open} onOpenChange={setOpen} text={posterText} />
        </>
      )}
    </div>
  );
}
