"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  variant?: "default" | "destructive";
}

interface ConfirmState extends ConfirmOptions {
  open: boolean;
  resolve: (value: boolean) => void;
}

/**
 * useConfirm — drop-in replacement for window.confirm().
 *
 * Usage:
 *   const { confirm, ConfirmDialogNode } = useConfirm();
 *
 *   // In handler:
 *   const ok = await confirm("Delete this item?");
 *   if (!ok) return;
 *
 *   // In JSX:
 *   return <>{ConfirmDialogNode} ... </>
 */
export function useConfirm() {
  const t = useTranslations("confirm");
  const [state, setState] = useState<ConfirmState | null>(null);

  const confirm = useCallback(
    (messageOrOptions: string | ConfirmOptions): Promise<boolean> => {
      const options: ConfirmOptions =
        typeof messageOrOptions === "string"
          ? { message: messageOrOptions }
          : messageOrOptions;
      return new Promise((resolve) => {
        setState({ ...options, open: true, resolve });
      });
    },
    []
  );

  const handleClose = (value: boolean) => {
    state?.resolve(value);
    setState(null);
  };

  const ConfirmDialogNode = state ? (
    <Dialog open={state.open} onOpenChange={(open) => !open && handleClose(false)}>
      <DialogContent className="max-w-sm" hideClose>
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </div>
            <div className="pt-0.5">
              <DialogTitle>{state.title ?? t("title")}</DialogTitle>
              <DialogDescription className="mt-1">{state.message}</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" size="sm" onClick={() => handleClose(false)}>
            {t("cancel")}
          </Button>
          <Button
            variant={state.variant ?? "destructive"}
            size="sm"
            onClick={() => handleClose(true)}
          >
            {state.confirmLabel ?? t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ) : null;

  return { confirm, ConfirmDialogNode };
}
