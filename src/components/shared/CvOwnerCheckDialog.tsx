"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, FileUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CvOwnerMismatch } from "@/lib/cv/cvOwnerCheck";

interface CvOwnerCheckDialogProps {
  /** The mismatch the upload answered with; null keeps the dialog closed. */
  mismatch: CvOwnerMismatch | null;
  /** File types the replacement picker takes. */
  accept: string;
  /** True while the confirmed upload is being saved. */
  busy?: boolean;
  onConfirm: () => void;
  onPickAnother: (file: File) => void;
  /** Leaves without using the CV. Without it the seeker must pick one of the two. */
  onCancel?: () => void;
}

/**
 * Shown when an uploaded CV names someone other than the account holder
 * (2026-11-24: a seeker could fill their profile from a friend's CV). Nothing
 * is saved until they say it is theirs or choose another file.
 */
export function CvOwnerCheckDialog({ mismatch, accept, busy, onConfirm, onPickAnother, onCancel }: CvOwnerCheckDialogProps) {
  const t = useTranslations("common.cvOwnerCheck");
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <Dialog
      open={Boolean(mismatch)}
      onOpenChange={(open) => {
        if (!open && onCancel && !busy) onCancel();
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        // Without a way out, a click outside or Escape must not leave it half-answered.
        onEscapeKeyDown={(e) => { if (!onCancel || busy) e.preventDefault(); }}
        closeOnOutsideClick={Boolean(onCancel) && !busy}
        hideClose={!onCancel}
      >
        {/* Room for the close button, which otherwise covers the text on phones. */}
        <DialogHeader className={onCancel ? "pe-10 text-start" : "text-start"}>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 shrink-0 text-amber-600" aria-hidden />
            {t("title")}
          </DialogTitle>
          <DialogDescription>
            {mismatch ? t("body", { cvName: mismatch.cvName, accountName: mismatch.accountName }) : null}
          </DialogDescription>
        </DialogHeader>
        {mismatch ? (
          <div className="space-y-1 text-sm text-muted-foreground">
            {mismatch.cvEmail ? <p className="break-all">{t("emailLine", { email: mismatch.cvEmail })}</p> : null}
            <p>{t("keepsName", { accountName: mismatch.accountName })}</p>
          </div>
        ) : null}
        <DialogFooter className="gap-2 sm:gap-2">
          {onCancel ? (
            <Button variant="ghost" className="min-h-11 sm:min-h-9" onClick={onCancel} disabled={busy}>
              {t("cancel")}
            </Button>
          ) : null}
          <Button variant="outline" className="min-h-11 sm:min-h-9" onClick={() => fileRef.current?.click()} disabled={busy}>
            <FileUp className="size-4" aria-hidden />
            {t("pickAnother")}
          </Button>
          <Button className="min-h-11 sm:min-h-9" onClick={onConfirm} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {t("confirm")}
          </Button>
        </DialogFooter>
        <input
          ref={fileRef}
          type="file"
          accept={accept}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onPickAnother(file);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

export type CvOwnerAnswer = { kind: "confirm" } | { kind: "cancel" } | { kind: "another"; file: File };

/**
 * The owner question as a promise, for a flow that reads a CV and then fills
 * a form (the CV Builder import): `await ask(mismatch)` waits for the seeker.
 * Spread `dialogProps` on a <CvOwnerCheckDialog>.
 */
export function useCvOwnerQuestion() {
  const [pending, setPending] = useState<{ mismatch: CvOwnerMismatch; resolve: (a: CvOwnerAnswer) => void } | null>(null);
  const ask = useCallback(
    (mismatch: CvOwnerMismatch) => new Promise<CvOwnerAnswer>((resolve) => setPending({ mismatch, resolve })),
    [],
  );
  const answer = (a: CvOwnerAnswer) => {
    pending?.resolve(a);
    setPending(null);
  };
  return {
    ask,
    dialogProps: {
      mismatch: pending?.mismatch ?? null,
      onConfirm: () => answer({ kind: "confirm" }),
      onPickAnother: (file: File) => answer({ kind: "another", file }),
      onCancel: () => answer({ kind: "cancel" }),
    },
  };
}
