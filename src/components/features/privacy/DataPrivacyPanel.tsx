"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, Cookie, Download, FileCheck2, History, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ErrorState } from "@/components/shared/ErrorState";
import { CookieSettingsLink } from "@/components/shared/ConsentManager/CookieSettingsLink";
import { useConfirm } from "@/hooks/useConfirm";
import { useConsent } from "@/hooks/useConsent";
import {
  DeletionRequestError,
  ExportLimitError,
  useCancelDataRequest,
  useDownloadMyData,
  useMyConsents,
  useMyDataRequests,
  useRequestAccountDeletion,
  type DataRequest,
  type DataRequestStatus,
  type DataRequestType,
} from "@/hooks/useDataPrivacy";

const TYPE_KEYS: Record<DataRequestType, "typeExport" | "typeDelete" | "typeRectification" | "typeRestrict"> = {
  export: "typeExport",
  delete: "typeDelete",
  rectification: "typeRectification",
  restrict: "typeRestrict",
};

const STATUS_KEYS: Record<DataRequestStatus, "statusPending" | "statusInProgress" | "statusCompleted" | "statusRejected" | "statusCancelled"> = {
  pending: "statusPending",
  in_progress: "statusInProgress",
  completed: "statusCompleted",
  rejected: "statusRejected",
  cancelled: "statusCancelled",
};

const STATUS_VARIANT: Record<DataRequestStatus, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "secondary",
  in_progress: "secondary",
  completed: "default",
  rejected: "destructive",
  cancelled: "outline",
};

const ICO_COMPLAINT_URL = "https://ico.org.uk/make-a-complaint/";
/** Stands in for the link while the sentence is formatted, so the link can sit anywhere in a translation. */
const ICO_TOKEN = "%ico%";

/**
 * [LEGAL] UK GDPR Art 12(4): a person whose request is refused is told why. A
 * refused request, and a finished one that was only partly done, shows the
 * reason the team wrote. The team's internal notes never reach this page.
 */
function reasonShown(r: DataRequest): { label: "reasonRefusedLabel" | "reasonNotDoneLabel"; text: string } | null {
  const text = r.outcomeReason?.trim();
  if (!text) return null;
  if (r.status === "rejected") return { label: "reasonRefusedLabel", text };
  if (r.status === "completed") return { label: "reasonNotDoneLabel", text };
  return null;
}

function Section({ icon: Icon, title, description, children }: {
  icon: typeof Download;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 border-t border-border/70 pt-6 first:border-t-0 first:pt-0">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      <div className="sm:ps-11">{children}</div>
    </section>
  );
}

/**
 * The user's own GDPR controls: download a copy of their data, ask for the
 * account to be deleted (an admin completes it in Admin → GDPR), see the
 * Terms & Privacy acceptance on record, and see or change this browser's
 * cookie choice (the Cookie settings dialog, which also logs it to the account).
 */
export function DataPrivacyPanel() {
  const t = useTranslations("dataPrivacy");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const { confirm, ConfirmDialogNode } = useConfirm();
  const date = (value: string) => format.dateTime(new Date(value), { dateStyle: "medium" });

  const requests = useMyDataRequests();
  const consents = useMyConsents();
  const download = useDownloadMyData();
  const requestDeletion = useRequestAccountDeletion();
  const cancelRequest = useCancelDataRequest();
  // The cookie choice lives in this browser (mpl_consent), not in the account log.
  // useConsent reads the cookie in an effect, so its state is null on the first
  // render whether or not a choice exists. `cookieRead` flips in the same
  // effect pass (batched with that state), so "no choice yet" is only ever shown
  // for a cookie that was actually read and is absent.
  const { state: cookieChoice } = useConsent();
  const [cookieRead, setCookieRead] = useState(false);
  useEffect(() => setCookieRead(true), []);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reason, setReason] = useState("");

  const openDeletion = requests.data?.find((r) => r.requestType === "delete" && (r.status === "pending" || r.status === "in_progress"));

  const handleDownload = () =>
    download.mutate(undefined, {
      onSuccess: () => toast.success(t("exportDone")),
      onError: (err) => toast.error(err instanceof ExportLimitError ? t("exportLimit") : t("exportError")),
    });

  const handleRequestDeletion = () =>
    requestDeletion.mutate(reason, {
      onSuccess: () => {
        toast.success(t("deletionRequested"));
        setDeleteOpen(false);
        setReason("");
      },
      onError: (err) => {
        const code = err instanceof DeletionRequestError ? err.code : "UNKNOWN";
        toast.error(code === "REQUEST_OPEN" ? t("deletionRequestOpen") : code === "ADMIN_ACCOUNT" ? t("deletionAdminAccount") : t("deletionRequestError"));
        if (code === "REQUEST_OPEN") setDeleteOpen(false);
      },
    });

  const handleCancel = async (request: DataRequest) => {
    const ok = await confirm({
      title: t("cancelRequestTitle"),
      message: t("cancelRequestMessage"),
      confirmLabel: t("cancelRequestConfirm"),
    });
    if (!ok) return;
    cancelRequest.mutate(request._id, {
      onSuccess: () => toast.success(t("requestCancelled")),
      onError: () => toast.error(t("cancelError")),
    });
  };

  const terms = consents.data?.terms_and_privacy ?? null;

  return (
    <div className="space-y-6">
      {ConfirmDialogNode}

      <Section icon={Download} title={t("exportTitle")} description={t("exportDescription")}>
        <Button variant="outline" onClick={handleDownload} disabled={download.isPending} className="min-h-11 gap-2 sm:min-h-9">
          {download.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />}
          {download.isPending ? t("exporting") : t("exportButton")}
        </Button>
      </Section>

      <Section icon={Trash2} title={t("deleteTitle")} description={t("deleteDescription")}>
        {requests.isLoading ? (
          <Skeleton className="h-11 w-56" />
        ) : openDeletion ? (
          <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4" role="status">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-medium text-amber-900">
                  {openDeletion.status === "pending" ? t("deletePendingTitle") : t("deleteInProgressTitle")}
                </p>
                <p className="mt-1 text-sm text-amber-800">
                  {openDeletion.status === "pending"
                    ? t("deletePendingBody", { date: date(openDeletion.createdAt) })
                    : t("deleteInProgressBody", { date: date(openDeletion.createdAt) })}
                </p>
              </div>
            </div>
            {openDeletion.status === "pending" && (
              <Button variant="outline" size="sm" onClick={() => void handleCancel(openDeletion)} disabled={cancelRequest.isPending} className="min-h-11 gap-2 sm:min-h-9">
                {cancelRequest.isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                {t("cancelRequestButton")}
              </Button>
            )}
          </div>
        ) : (
          <Button variant="destructive" onClick={() => setDeleteOpen(true)} disabled={requests.isError} className="min-h-11 gap-2 sm:min-h-9">
            <Trash2 className="size-4" aria-hidden="true" />
            {t("deleteButton")}
          </Button>
        )}
      </Section>

      <Section icon={FileCheck2} title={t("consentsTitle")} description={t("consentsDescription")}>
        {consents.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : consents.isError ? (
          <ErrorState description={t("consentsLoadError")} onRetry={() => void consents.refetch()} retryLabel={t("retry")} />
        ) : (
          <ul className="space-y-3">
            <li className="rounded-lg border border-border/70 bg-muted/30 p-4">
              <p className="text-sm font-medium text-foreground">{t("termsTitle")}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {terms?.granted ? t("termsAcceptedOn", { date: date(terms.at) }) : t("termsNoRecord")}
              </p>
            </li>
            <li className="flex flex-col gap-3 rounded-lg border border-border/70 bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Cookie className="size-4 text-muted-foreground" aria-hidden="true" />
                  {t("cookiesTitle")}
                </p>
                {!cookieRead ? (
                  <Skeleton className="mt-1.5 h-4 w-56 max-w-full" />
                ) : cookieChoice ? (
                  <>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t("cookiesChoice", {
                        display: t(cookieChoice.preferences ? "cookiesDisplayOn" : "cookiesDisplayOff"),
                        videos: t(cookieChoice.media ? "cookiesVideosOn" : "cookiesVideosOff"),
                      })}
                    </p>
                    {/* A cookie from an older build or a hand edit can carry an unreadable date; skip the line rather than throw. */}
                    {Number.isFinite(Date.parse(cookieChoice.at)) && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{t("cookiesChosenOn", { date: date(cookieChoice.at) })}</p>
                    )}
                  </>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">{t("cookiesNotSet")}</p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">{t("cookiesDescription")}</p>
              </div>
              <CookieSettingsLink asChild>
                <Button size="sm" variant="outline" className="min-h-11 shrink-0 gap-2 sm:min-h-9">
                  <Cookie className="size-4" aria-hidden="true" />
                  {t("cookieSettings")}
                </Button>
              </CookieSettingsLink>
            </li>
          </ul>
        )}
      </Section>

      <Section icon={History} title={t("historyTitle")}>
        {requests.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : requests.isError ? (
          <ErrorState description={t("historyLoadError")} onRetry={() => void requests.refetch()} retryLabel={t("retry")} />
        ) : (requests.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("historyEmpty")}</p>
        ) : (
          <ul className="space-y-2">
            {requests.data!.map((r) => {
              const reason = reasonShown(r);
              // [LEGAL] UK GDPR Art 12(4): with the reason, the right to complain to the ICO. One sentence, the link inside it.
              const [complaintBefore, complaintAfter] = t("reasonComplaint", { ico: ICO_TOKEN }).split(ICO_TOKEN);
              const complaintLine = (
                <>
                  {complaintBefore}
                  <a href={ICO_COMPLAINT_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline underline-offset-2">
                    {t("reasonComplaintIco")}
                    <span className="sr-only"> {tCommon("opensInNewTab")}</span>
                  </a>
                  {complaintAfter}
                </>
              );
              return (
                <li key={r._id} className="rounded-lg bg-muted/40 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{t(TYPE_KEYS[r.requestType] ?? "typeExport")}</p>
                      <p className="text-xs text-muted-foreground">{t("requestedOn", { date: date(r.createdAt) })}</p>
                      {/* [LEGAL] Art 12(4): when the refusal was given (completedAt is its decision date). */}
                      {r.status === "rejected" && r.completedAt && (
                        <p className="text-xs text-muted-foreground">{t("refusedOn", { date: date(r.completedAt) })}</p>
                      )}
                    </div>
                    <Badge variant={STATUS_VARIANT[r.status] ?? "outline"}>{t(STATUS_KEYS[r.status] ?? "statusPending")}</Badge>
                  </div>
                  {reason && (
                    <div className="mt-2 border-t border-border/60 pt-2">
                      <p className="text-xs font-medium text-muted-foreground">{t(reason.label)}</p>
                      <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-foreground">{reason.text}</p>
                      <p className="mt-2 text-xs text-muted-foreground">{complaintLine}</p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Dialog open={deleteOpen} onOpenChange={(open) => !requestDeletion.isPending && setDeleteOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteDialogTitle")}</DialogTitle>
            <DialogDescription>{t("deleteDialogDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">{t("deleteWhatHappens")}</div>
            <div className="space-y-1.5">
              <Label htmlFor="gdpr-delete-reason">{t("deleteReasonLabel")}</Label>
              <Textarea
                id="gdpr-delete-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value.slice(0, 1000))}
                placeholder={t("deleteReasonPlaceholder")}
                rows={3}
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={requestDeletion.isPending}>
              {t("keepAccount")}
            </Button>
            <Button variant="destructive" onClick={handleRequestDeletion} disabled={requestDeletion.isPending} className="gap-2">
              {requestDeletion.isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {t("confirmDeleteRequest")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
