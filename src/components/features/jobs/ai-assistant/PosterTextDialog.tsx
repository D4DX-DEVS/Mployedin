"use client";

import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface PosterTextDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The text the AI read from the uploaded poster. */
  text: string;
}

/**
 * Shows exactly what the AI read from the poster, so the employer can see why
 * the draft says what it says. Shared by the AI job creator and the job form's
 * assistant.
 */
export function PosterTextDialog({ open, onOpenChange, text }: PosterTextDialogProps) {
  const t = useTranslations("jobAssistant.poster");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-lg rounded-2xl">
        <DialogHeader>
          <DialogTitle>{t("dialogTitle")}</DialogTitle>
          <DialogDescription>{t("dialogDescription")}</DialogDescription>
        </DialogHeader>
        <div
          dir="auto"
          tabIndex={0}
          aria-label={t("dialogTitle")}
          className="max-h-[55dvh] overflow-y-auto whitespace-pre-wrap rounded-xl border border-border bg-muted/40 p-3 text-sm leading-6 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {text}
        </div>
      </DialogContent>
    </Dialog>
  );
}
