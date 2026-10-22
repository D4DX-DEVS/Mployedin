"use client";

import { useRef, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { UserAvatar } from "@/components/shared/UserAvatar";
import type { RowAction } from "@/components/shared/RowActions";
import { formatDateTime } from "@/lib/ui/intlFormat";
import { RequestStatusBadge } from "./RequestStatusBadge";
import { useGdprLabels } from "./useGdprLabels";
import type { GdprRequestRow, GdprRequestType } from "./types";

/**
 * What each kind of request asks for. Static keys, not t(`asked_${type}`): a
 * type stored before a rename shows no line instead of a missing-message error.
 */
const ASKED_KEYS: Partial<Record<GdprRequestType, "detailsAskedExport" | "detailsAskedDelete" | "detailsAskedRectification" | "detailsAskedRestrict">> = {
  export: "detailsAskedExport",
  delete: "detailsAskedDelete",
  rectification: "detailsAskedRectification",
  restrict: "detailsAskedRestrict",
};

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

function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2 min-w-0" : "min-w-0"}>
      <dt className="font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-foreground">{children}</dd>
    </div>
  );
}

/** One block of free text (the user's words, or what the team wrote). Only rendered when there is something to show. */
function TextBlock({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <p className="flex flex-wrap items-center gap-x-2 text-sm font-medium text-muted-foreground">
        <span>{label}</span>
        {hint && (
          <span className="inline-flex items-center gap-1 text-xs font-normal">
            <Lock className="size-3" aria-hidden="true" />
            <span>{hint}</span>
          </span>
        )}
      </p>
      <div className="mt-1 whitespace-pre-wrap break-words rounded-lg border bg-muted/50 text-sm card-pad">{children}</div>
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
  // nothing about how fast admins answer. A refusal is an answer: completedAt is its decision date.
  const decided = request?.status === "completed" || request?.status === "rejected";
  const responseMs = request && request.requestType !== "export" && decided && request.completedAt
    ? new Date(request.completedAt).getTime() - new Date(request.createdAt).getTime()
    : null;

  // What the team recorded. Blank text is the same as none, and none is not shown.
  const outcome = request?.outcome?.trim();
  const outcomeReason = request?.outcomeReason?.trim();
  const adminNotes = request?.adminNotes?.trim();
  const userReason = request?.notes?.trim();
  // An export no admin handled: the user downloaded it themselves. The data itself is never offered here.
  const selfServiceExport = request?.requestType === "export" && request.status === "completed" && !outcome && !request.handledByName;
  const askedKey = request ? ASKED_KEYS[request.requestType] : undefined;

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
              {askedKey && <Field label={t("detailsAskedLabel")} wide>{t(askedKey)}</Field>}
              <Field label={t("requestTypeColumnHeader")}>{typeLabel(request.requestType)}</Field>
              <Field label={t("statusColumnHeader")}><RequestStatusBadge status={request.status} /></Field>
              <Field label={t("submittedColumnHeader")}>{formatDateTime(request.createdAt, WHEN, locale)}</Field>
              <Field label={request.status === "rejected" ? t("detailsRefusedOnLabel") : t("completedColumnHeader")}>
                {request.completedAt ? formatDateTime(request.completedAt, WHEN, locale) : "—"}
              </Field>
              {responseMs !== null && (
                <Field label={t("detailsResponseTimeLabel")}>{responseTime(Math.max(0, responseMs))}</Field>
              )}
              <Field label={t("detailsHandledByLabel")}>{handledBy(request)}</Field>
            </dl>

            {userReason && <TextBlock label={t("detailsReasonLabel")}>{userReason}</TextBlock>}
            {outcome && <TextBlock label={t("detailsDoneLabel")}>{outcome}</TextBlock>}
            {selfServiceExport && (
              <TextBlock label={t("detailsDoneLabel")}>
                <span className="block">{t("detailsSelfServiceDone")}</span>
                {request.completedAt && (
                  <span className="mt-1 block text-xs text-muted-foreground">{formatDateTime(request.completedAt, WHEN, locale)}</span>
                )}
              </TextBlock>
            )}
            {outcomeReason && <TextBlock label={t("detailsNotDoneLabel")}>{outcomeReason}</TextBlock>}
            {adminNotes && (
              <TextBlock label={t("detailsInternalNotesLabel")} hint={t("detailsInternalNotesHint")}>{adminNotes}</TextBlock>
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
