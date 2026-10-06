"use client";

import { useRef, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { UserAvatar } from "@/components/shared/UserAvatar";
import type { RowAction } from "@/components/shared/RowActions";
import { formatDateTime } from "@/lib/ui/intlFormat";
import { useGdprLabels } from "./useGdprLabels";
import type { GdprRequestRow } from "./types";

/** "Oct 01, 2026, 3:48 PM" — the list's date plus the minute; seconds are noise here. */
const WHEN: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" };

interface GdprRequestDetailsDialogProps {
  /** The request on show. Kept by the caller after closing, so the content stays put while the dialog animates out. */
  request: GdprRequestRow | null;
  open: boolean;
  onClose: () => void;
  /**
   * The status moves still open to this request — the same ones as its row
   * menu. The dialog stays open while one runs: Complete and Reject open their
   * confirm on top of it, a cancel lands back here, and the caller closes it
   * once the change is saved.
   */
  actions: RowAction[];
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-foreground">{children}</dd>
    </div>
  );
}

/**
 * Everything the register holds about one data request. Finished requests had
 * no action at all, and the reason a user gave for deleting their account was
 * stored but shown nowhere.
 */
export function GdprRequestDetailsDialog({ request, open, onClose, actions }: GdprRequestDetailsDialogProps) {
  const t = useTranslations("adminGdpr");
  const locale = useLocale();
  const { typeLabel, responseTime } = useGdprLabels();
  // Set while a move runs, so a second click can't send it twice. A ref, not
  // `disabled`: a disabled button can't take focus back when the confirm on
  // top of this dialog closes, and keyboard focus would fall to <body>.
  const running = useRef(false);

  const run = async (action: RowAction) => {
    if (running.current) return;
    running.current = true;
    try {
      await Promise.resolve(action.onSelect?.());
    } finally {
      running.current = false;
    }
  };

  const handledBy = (r: GdprRequestRow): string => {
    // An export is the user's own download; no admin ever touches it.
    if (r.requestType === "export") return t("detailsHandledBySelf");
    if (r.handledByName) return r.handledByName;
    return r.status === "pending" ? t("detailsNotHandledYet") : "—";
  };

  // An export's "response time" is the second it took to download, which says
  // nothing about how fast admins answer.
  const responseMs = request && request.requestType !== "export" && request.status === "completed" && request.completedAt
    ? new Date(request.completedAt).getTime() - new Date(request.createdAt).getTime()
    : null;

  return (
    <Dialog open={open && request !== null} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("detailsTitle")}</DialogTitle>
          <DialogDescription className="sr-only">{t("detailsDescription")}</DialogDescription>
        </DialogHeader>

        {request && (
          <div className="space-y-4">
            <div className="flex min-w-0 items-center gap-3">
              <UserAvatar name={request.userName} email={request.userEmail} className="h-10 w-10 shrink-0" colorful />
              <div className="min-w-0">
                <p className="break-words font-medium text-foreground">{request.userName}</p>
                <p className="break-all text-sm text-muted-foreground">{request.userEmail}</p>
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-4 text-sm">
              <Field label={t("requestTypeColumnHeader")}>{typeLabel(request.requestType)}</Field>
              <Field label={t("statusColumnHeader")}><StatusBadge status={request.status} /></Field>
              <Field label={t("submittedColumnHeader")}>{formatDateTime(request.createdAt, WHEN, locale)}</Field>
              <Field label={t("completedColumnHeader")}>
                {request.completedAt ? formatDateTime(request.completedAt, WHEN, locale) : "—"}
              </Field>
              {responseMs !== null && (
                <Field label={t("detailsResponseTimeLabel")}>{responseTime(Math.max(0, responseMs))}</Field>
              )}
              <Field label={t("detailsHandledByLabel")}>{handledBy(request)}</Field>
            </dl>

            {(request.requestType === "delete" || request.notes) && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t("detailsReasonLabel")}</p>
                <p className="mt-1 whitespace-pre-wrap break-words rounded-lg border bg-muted/50 text-sm card-pad">
                  {request.notes || t("detailsNoReason")}
                </p>
              </div>
            )}
          </div>
        )}

        {actions.length > 0 && (
          <DialogFooter>
            {actions.map((action) => {
              const Icon = action.icon;
              return (
                <Button
                  key={action.key}
                  type="button"
                  variant={action.destructive ? "outline" : "default"}
                  className={action.destructive ? "min-h-11 text-destructive hover:text-destructive sm:min-h-10" : "min-h-11 sm:min-h-10"}
                  disabled={action.disabled}
                  onClick={() => void run(action)}
                >
                  <Icon className="me-1.5 h-4 w-4" aria-hidden="true" />
                  {action.label}
                </Button>
              );
            })}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
