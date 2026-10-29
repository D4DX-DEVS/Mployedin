"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CheckCircle2, History, SearchX, XCircle } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/ui/intlFormat";
import { PolicyVersionText } from "./PolicyVersionText";
import { parseOtherConsentDetails, type OtherConsentDetails } from "./otherConsent";
import { useGdprLabels } from "./useGdprLabels";

/** The list's date plus the minute; seconds are noise here. */
const WHEN: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" };

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "missing" }
  | { status: "ready"; details: OtherConsentDetails };

interface OtherConsentDialogProps {
  /** The entry on show. Kept by the caller after closing, so the content stays while the dialog animates out. */
  entryId: string | null;
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

/** Yes or No in words and an icon, never colour alone. */
function Answer({ granted }: { granted: boolean }) {
  const t = useTranslations("adminGdpr");
  return granted ? (
    <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />{t("consentYesLabel")}</span>
  ) : (
    <span className="inline-flex items-center gap-1 text-red-600"><XCircle className="size-3.5 shrink-0" aria-hidden="true" />{t("consentNoLabel")}</span>
  );
}

/**
 * One Other consents entry in full (GET /api/admin/gdpr/consent/entries/[id]):
 * who, the consent and what it means, the answer, whether it is still the
 * account's current answer, where and when, the version (for Terms, whether it
 * is today's), and the account's other answers of the same type, each tagged
 * Earlier or Later. Laid out like the cookie choice record.
 */
export function OtherConsentDialog({ entryId, open, onClose }: OtherConsentDialogProps) {
  const t = useTranslations("adminGdpr");
  const locale = useLocale();
  const { consentTypeLabel, sourceLabel } = useGdprLabels();
  const historyId = useId();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (id: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ status: "loading" });
    try {
      const res = await fetch(`/api/admin/gdpr/consent/entries/${encodeURIComponent(id)}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (res.status === 404) {
        setState({ status: "missing" });
        return;
      }
      const details = res.ok ? parseOtherConsentDetails(await res.json()) : null;
      if (controller.signal.aborted) return;
      setState(details ? { status: "ready", details } : { status: "error" });
    } catch {
      if (!controller.signal.aborted) setState({ status: "error" });
    }
  }, []);

  useEffect(() => {
    if (open && entryId) void load(entryId);
  }, [open, entryId, load]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Static keys: a type stored before a rename shows no meaning rather than a missing-message error.
  const MEANINGS: Record<string, string> = {
    terms_and_privacy: t("otherConsentMeaningTerms"),
    cookies: t("otherConsentMeaningCookies"),
    marketing: t("otherConsentMeaningMarketing"),
  };

  const details = state.status === "ready" ? state.details : null;
  const entry = details?.entry;

  return (
    <Dialog open={open && entryId !== null} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent side="end" className="flex flex-col gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="space-y-1 border-b px-5 pb-4 pt-5 pe-14">
          <DialogTitle>{t("otherConsentDialogTitle")}</DialogTitle>
          <DialogDescription className="sr-only">{t("otherConsentDialogDescription")}</DialogDescription>
        </DialogHeader>

        <div
          aria-live="polite"
          aria-busy={state.status === "loading"}
          className="scrollbar-none min-w-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5"
        >
          {state.status === "loading" && (
            <div className="space-y-4" data-testid="other-consent-skeleton">
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

          {state.status === "error" && entryId && (
            <ErrorState className="py-6 sm:py-6" title={t("otherConsentErrorTitle")} retryLabel={t("cookieChoiceRetry")} onRetry={() => void load(entryId)} />
          )}

          {state.status === "missing" && (
            <EmptyState className="py-6 sm:py-6" icon={SearchX} title={t("otherConsentNotFoundTitle")} />
          )}

          {details && entry && (
            <div className="space-y-5">
              <div className="flex min-w-0 items-center gap-3">
                <UserAvatar name={entry.userName} email={entry.userEmail ?? undefined} className="h-10 w-10 shrink-0" colorful />
                <div className="min-w-0">
                  <p className="break-words font-medium text-foreground">{entry.userName}</p>
                  {entry.userEmail ? <p className="break-all text-sm text-muted-foreground">{entry.userEmail}</p> : null}
                </div>
              </div>

              <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                <Field label={t("consentTypeColumnHeader")}>{consentTypeLabel(entry.consentType)}</Field>
                <Field label={t("otherConsentAnswerLabel")}><Answer granted={entry.granted} /></Field>
                <Field label={t("statusColumnHeader")}>
                  {details.status === "current" ? (
                    <Badge variant="success" className="gap-1"><CheckCircle2 className="size-3.5" aria-hidden="true" />{t("otherConsentStatusCurrent")}</Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1"><History className="size-3.5" aria-hidden="true" />{t("otherConsentStatusReplaced")}</Badge>
                  )}
                </Field>
                <Field label={t("recordedAtColumnHeader")}>{formatDateTime(entry.timestamp, WHEN, locale)}</Field>
                <Field label={t("consentSourceColumnHeader")}>{sourceLabel(entry.source)}</Field>
                <Field label={t("otherConsentVersionLabel")}>
                  {entry.policyVersion ? <PolicyVersionText value={entry.policyVersion} /> : t("cookieChoiceNotRecorded")}
                  {details.termsVersion ? (
                    <span className="block text-xs text-muted-foreground">
                      {details.termsVersion === "current" ? t("otherConsentTermsCurrent") : t("otherConsentTermsOlder")}
                    </span>
                  ) : null}
                </Field>
                {MEANINGS[entry.consentType] ? (
                  <div className="sm:col-span-2">
                    <Field label={t("otherConsentMeaningLabel")}>{MEANINGS[entry.consentType]}</Field>
                  </div>
                ) : null}
              </dl>

              <div className="space-y-2">
                <h3 id={historyId} className="text-sm font-semibold text-foreground">{t("otherConsentHistoryTitle")}</h3>
                {details.history.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("otherConsentHistoryNone")}</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-border/60">
                    <table aria-labelledby={historyId} data-mobile-table="scroll" className="w-full text-sm">
                      <thead className="bg-muted/30 text-xs text-muted-foreground">
                        <tr>
                          <th scope="col" className="px-3 py-2 text-start font-medium">{t("recordedAtColumnHeader")}</th>
                          <th scope="col" className="px-3 py-2 text-start font-medium">{t("otherConsentAnswerLabel")}</th>
                          <th scope="col" className="px-3 py-2 text-start font-medium">{t("otherConsentVersionLabel")}</th>
                          <th scope="col" className="px-3 py-2 text-start font-medium">{t("consentSourceColumnHeader")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {details.history.map((item) => (
                          <tr key={item._id}>
                            <td className="whitespace-nowrap px-3 py-2">
                              <span className="block">{formatDateTime(item.timestamp, WHEN, locale)}</span>
                              {/* Words, not position or colour: the list is newest first either way. */}
                              <Badge variant="outline" className="mt-1 font-normal">
                                {item.relation === "later" ? t("otherChoiceLater") : t("otherChoiceEarlier")}
                              </Badge>
                            </td>
                            <td className="whitespace-nowrap px-3 py-2"><Answer granted={item.granted} /></td>
                            <td className="whitespace-nowrap px-3 py-2">
                              {item.policyVersion ? <PolicyVersionText value={item.policyVersion} /> : t("cookieChoiceNotRecorded")}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2">{sourceLabel(item.source)}</td>
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
