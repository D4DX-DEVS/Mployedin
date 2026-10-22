"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CheckCircle2, Copy, History, SearchX } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/ui/intlFormat";
import { ChoiceOutcomeBadge } from "./ChoiceOutcomeBadge";
import { parseConsentRecord, type ConsentRecordDetails, type ShownWording } from "./cookieChoice";
import { PolicyVersionText } from "./PolicyVersionText";
import { useGdprLabels } from "./useGdprLabels";

/** The list's date plus the minute; seconds are noise here. */
const WHEN: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" };

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "missing" }
  | { status: "ready"; details: ConsentRecordDetails };

interface ConsentRecordDialogProps {
  /** The choice reference on show. Kept by the caller after closing, so the content stays while the dialog animates out. */
  receiptId: string | null;
  open: boolean;
  onClose: () => void;
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
 * One signed-in cookie choice in full (GET /api/admin/gdpr/consent/choices/[ref]):
 * who, whether it is still the account's current choice, the reference (with a
 * copy button), when and where it was made, the banner wording version and
 * whether that wording is still today's, what each category was set to (with
 * the category descriptions visitors see in Cookie settings), and the account's
 * other cookie choices, each tagged Earlier or Later than this one. Laid out
 * like the data request details dialog.
 */
export function ConsentRecordDialog({ receiptId, open, onClose }: ConsentRecordDialogProps) {
  const t = useTranslations("adminGdpr");
  const tc = useTranslations("consent");
  const locale = useLocale();
  const { sourceLabel, onOffLabel } = useGdprLabels();
  const categoriesId = useId();
  const othersId = useId();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (reference: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ status: "loading" });
    try {
      const res = await fetch(`/api/admin/gdpr/consent/choices/${encodeURIComponent(reference)}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (res.status === 404) {
        setState({ status: "missing" });
        return;
      }
      const details = res.ok ? parseConsentRecord(await res.json()) : null;
      if (controller.signal.aborted) return;
      setState(details ? { status: "ready", details } : { status: "error" });
    } catch {
      if (!controller.signal.aborted) setState({ status: "error" });
    }
  }, []);

  useEffect(() => {
    if (open && receiptId) void load(receiptId);
  }, [open, receiptId, load]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const copyReference = async (reference: string) => {
    try {
      await navigator.clipboard.writeText(reference);
      toast.success(t("recordCopied"));
    } catch {
      toast.error(t("recordCopyError"));
    }
  };

  const wordingLabel: Record<ShownWording, string> = {
    same: t("recordWordingSame"),
    older: t("cookieChoiceWordingOlder"),
    unknown: t("recordWordingUnknown"),
  };

  const details = state.status === "ready" ? state.details : null;
  const record = details?.record;

  return (
    <Dialog open={open && receiptId !== null} onOpenChange={(next) => { if (!next) onClose(); }}>
      {/* A side panel like the other admin detail panels: the header stays put
          and only the details scroll, with the bar hidden (wheel, touch and
          keyboard still scroll it). */}
      <DialogContent side="end" className="flex flex-col gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="space-y-1 border-b px-5 pb-4 pt-5 pe-14">
          <DialogTitle>{t("recordDialogTitle")}</DialogTitle>
          <DialogDescription className="sr-only">{t("recordDialogDescription")}</DialogDescription>
        </DialogHeader>

        <div
          aria-live="polite"
          aria-busy={state.status === "loading"}
          className="scrollbar-none min-w-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5"
        >
          {state.status === "loading" && (
            <div className="space-y-4" data-testid="consent-record-skeleton">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-52" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
              </div>
              <Skeleton className="h-28 w-full" />
            </div>
          )}

          {state.status === "error" && receiptId && (
            <ErrorState className="py-6 sm:py-6" title={t("recordErrorTitle")} retryLabel={t("cookieChoiceRetry")} onRetry={() => void load(receiptId)} />
          )}

          {state.status === "missing" && (
            <EmptyState className="py-6 sm:py-6" icon={SearchX} title={t("recordNotFoundTitle")} description={t("recordNotFoundHelp")} />
          )}

          {details && record && (
            <div className="space-y-5">
              <div className="flex min-w-0 items-center gap-3">
                <UserAvatar name={record.userName} email={record.userEmail ?? undefined} className="h-10 w-10 shrink-0" colorful />
                <div className="min-w-0">
                  <p className="break-words font-medium text-foreground">{record.userName}</p>
                  {record.userEmail ? <p className="break-all text-sm text-muted-foreground">{record.userEmail}</p> : null}
                </div>
              </div>

              <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                <Field label={t("statusColumnHeader")}>
                  {details.status === "current" ? (
                    <Badge variant="success" className="gap-1"><CheckCircle2 className="size-3.5" aria-hidden="true" />{t("recordStatusCurrent")}</Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1"><History className="size-3.5" aria-hidden="true" />{t("recordStatusReplaced")}</Badge>
                  )}
                </Field>
                <Field label={t("choiceColumnHeader")}><ChoiceOutcomeBadge outcome={record.outcome} /></Field>
                <Field label={t("choiceReferenceColumnHeader")}>
                  {record.receiptId ? (
                    <span className="flex min-w-0 items-center gap-1">
                      <span dir="ltr" className="min-w-0 break-all font-mono text-xs">{record.receiptId}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-9 shrink-0"
                        aria-label={t("recordCopyReference")}
                        title={t("recordCopyReference")}
                        onClick={() => void copyReference(record.receiptId as string)}
                      >
                        <Copy className="size-4" aria-hidden="true" />
                      </Button>
                    </span>
                  ) : (
                    t("cookieChoiceNotRecorded")
                  )}
                </Field>
                <Field label={t("recordedAtColumnHeader")}>{formatDateTime(record.recordedAt, WHEN, locale)}</Field>
                <Field label={t("consentSourceColumnHeader")}>{sourceLabel(record.source)}</Field>
                <Field label={t("bannerVersionColumnHeader")}>
                  {record.policyVersion ? <PolicyVersionText value={record.policyVersion} /> : t("cookieChoiceNotRecorded")}
                </Field>
                <Field label={t("recordWordingLabel")}>{wordingLabel[details.wording]}</Field>
              </dl>

              <div className="space-y-2">
                <h3 id={categoriesId} className="text-sm font-semibold text-foreground">{t("recordCategoriesTitle")}</h3>
                <div className="overflow-x-auto rounded-xl border border-border/60">
                  <table aria-labelledby={categoriesId} data-mobile-table="scroll" className="w-full text-sm">
                    <thead className="bg-muted/30 text-xs text-muted-foreground">
                      <tr>
                        <th scope="col" className="px-3 py-2 text-start font-medium">{t("recordCategoryColumn")}</th>
                        <th scope="col" className="px-3 py-2 text-start font-medium">{t("recordSettingColumn")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {[
                        { key: "necessary", name: tc("settings.necessaryTitle"), description: tc("settings.necessaryDescription"), value: tc("settings.alwaysOn") },
                        { key: "preferences", name: t("cookieChoiceDisplaySettings"), description: tc("settings.preferencesDescription"), value: onOffLabel(record.preferences) },
                        { key: "media", name: t("cookieChoiceYouTubeVideos"), description: tc("settings.mediaDescription"), value: onOffLabel(record.media) },
                      ].map((category) => (
                        <tr key={category.key}>
                          <td className="px-3 py-2 align-top">
                            <p className="font-medium text-foreground">{category.name}</p>
                            <p className="text-xs text-muted-foreground">{category.description}</p>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 align-top text-foreground">{category.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-2">
                <h3 id={othersId} className="text-sm font-semibold text-foreground">{t("otherChoicesTitle")}</h3>
                {details.otherChoices.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("otherChoicesNone")}</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-border/60">
                    <table aria-labelledby={othersId} data-mobile-table="scroll" className="w-full text-sm">
                      <thead className="bg-muted/30 text-xs text-muted-foreground">
                        <tr>
                          <th scope="col" className="px-3 py-2 text-start font-medium">{t("recordedAtColumnHeader")}</th>
                          <th scope="col" className="px-3 py-2 text-start font-medium">{t("choiceColumnHeader")}</th>
                          <th scope="col" className="px-3 py-2 text-start font-medium">{t("cookieChoiceDisplaySettings")}</th>
                          <th scope="col" className="px-3 py-2 text-start font-medium">{t("cookieChoiceYouTubeVideos")}</th>
                          <th scope="col" className="px-3 py-2 text-start font-medium">{t("consentSourceColumnHeader")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {details.otherChoices.map((change, index) => (
                          <tr key={`${change.recordedAt}-${index}`}>
                            <td className="whitespace-nowrap px-3 py-2">
                              <span className="block">{formatDateTime(change.recordedAt, WHEN, locale)}</span>
                              {/* Words, not position or colour: the list is newest first either way. */}
                              <Badge variant="outline" className="mt-1 font-normal">
                                {change.relation === "later" ? t("otherChoiceLater") : t("otherChoiceEarlier")}
                              </Badge>
                            </td>
                            <td className="px-3 py-2"><ChoiceOutcomeBadge outcome={change.outcome} /></td>
                            <td className="whitespace-nowrap px-3 py-2">{onOffLabel(change.preferences)}</td>
                            <td className="whitespace-nowrap px-3 py-2">{onOffLabel(change.media)}</td>
                            <td className="whitespace-nowrap px-3 py-2">{sourceLabel(change.source)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
