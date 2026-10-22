"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CheckCircle2, Eye, FileCheck2, FileClock, Loader2, Search, SearchX, XCircle } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { isReceiptId } from "@/lib/consent/receiptId";
import { formatDateTime } from "@/lib/ui/intlFormat";
import { CHOICE_OUTCOME_ICON } from "./ChoiceOutcomeBadge";
import {
  cookieChoiceOutcome,
  parseLookupResult,
  type CookieChoiceLookupRequest,
  type CookieChoiceLookupResult,
  type CookieChoiceReceipt,
  type CookieChoiceSource,
} from "./cookieChoice";
import { PolicyVersionText } from "./PolicyVersionText";
import { useGdprLabels } from "./useGdprLabels";

/** A choice reference is 36 characters: 32 hex digits and 4 dashes. */
const REFERENCE_LENGTH = 36;

type LookupState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "done"; result: CookieChoiceLookupResult; reference: string };

/** A result shaped like a real one, so the panel doesn't jump when the answer arrives. */
function ResultSkeleton() {
  return (
    <div className="space-y-3 rounded-xl border border-border/60 p-3 sm:p-4" data-testid="cookie-choice-skeleton">
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-36" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    </div>
  );
}

/** One label and its value, as text; the icon repeats what the words say. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 flex items-center gap-1.5 text-sm text-foreground">{children}</dd>
    </div>
  );
}

function OnOff({ on }: { on: boolean }) {
  const t = useTranslations("adminGdpr");
  const Icon = on ? CheckCircle2 : XCircle;
  return (
    <>
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      {on ? t("cookieChoiceOn") : t("cookieChoiceOff")}
    </>
  );
}

function languageName(locale: string, t: (key: "cookieChoiceLanguageAr" | "cookieChoiceLanguageEn") => string): string {
  if (locale === "ar") return t("cookieChoiceLanguageAr");
  if (locale === "en") return t("cookieChoiceLanguageEn");
  return locale;
}

/** `fallbackSource`: the linked account's log row, for a receipt written before receipts stored where it was made. */
function ReceiptRow({ receipt, fallbackSource }: { receipt: CookieChoiceReceipt; fallbackSource: CookieChoiceSource | null }) {
  const t = useTranslations("adminGdpr");
  const locale = useLocale();
  const { outcomeLabel, sourceLabel } = useGdprLabels();
  const outcome = cookieChoiceOutcome(receipt);
  const OutcomeIcon = CHOICE_OUTCOME_ICON[outcome];
  const WordingIcon = receipt.wordingMatchesCurrent ? FileCheck2 : FileClock;

  return (
    <li className="rounded-xl border border-border/60 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
          <OutcomeIcon className="size-4 shrink-0" aria-hidden="true" />
          {outcomeLabel(outcome)}
        </p>
        <p className="text-xs text-muted-foreground">{formatDateTime(receipt.createdAt, undefined, locale)}</p>
      </div>
      <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        <Fact label={t("cookieChoiceDisplaySettings")}>
          <OnOff on={receipt.preferences} />
        </Fact>
        <Fact label={t("cookieChoiceVideos")}>
          <OnOff on={receipt.media} />
        </Fact>
        <Fact label={t("cookieChoiceWordingLabel")}>
          <PolicyVersionText value={`cookie-v${receipt.version}`} />
        </Fact>
        <Fact label={t("cookieChoiceLanguageLabel")}>{languageName(receipt.locale, t)}</Fact>
        <Fact label={t("cookieChoiceTextLabel")}>
          <WordingIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          {receipt.wordingMatchesCurrent ? t("cookieChoiceWordingCurrent") : t("cookieChoiceWordingOlder")}
        </Fact>
        <Fact label={t("consentSourceColumnHeader")}>{sourceLabel(receipt.source ?? fallbackSource)}</Fact>
      </dl>
    </li>
  );
}

function LinkedAccountLine({ result, reference, onViewRecord }: { result: CookieChoiceLookupResult; reference: string; onViewRecord?: (reference: string) => void }) {
  const t = useTranslations("adminGdpr");
  const { sourceLabel } = useGdprLabels();
  const account = result.linkedAccount;
  // With the receipt gone (12 months), the account's log row is the only record of where it was made.
  const receiptGone = result.receipts.length === 0;
  return (
    <div className="mt-3 text-sm">
      {account ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{t("cookieChoiceAccountLabel")}</p>
            <p className="font-medium text-foreground">{account.userName}</p>
            {account.userEmail ? <p className="break-all text-xs text-muted-foreground">{account.userEmail}</p> : null}
            <p className="mt-1 text-xs text-muted-foreground">
              {account.firstChoice ? t("cookieLookupFirstChoice") : t("cookieLookupLaterChange")}
            </p>
            {receiptGone && (
              <dl className="mt-2">
                <Fact label={t("consentSourceColumnHeader")}>{sourceLabel(account.source)}</Fact>
              </dl>
            )}
          </div>
          {onViewRecord && (
            <Button type="button" variant="outline" className="min-h-11 shrink-0 sm:min-h-9" onClick={() => onViewRecord(reference)}>
              <Eye aria-hidden="true" />
              {t("cookieLookupViewRecord")}
            </Button>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t("cookieChoiceNoAccount")}</p>
      )}
    </div>
  );
}

/**
 * "Find a consent record": one cookie choice by the reference a visitor quotes
 * ("Your choice reference" in their Cookie settings). Works for visitors who
 * never signed in: the receipt is anonymous. For a choice made while signed in
 * it also names the account, says whether it was the account's first cookie
 * choice or a later change, and offers "View record". `request` is a click on
 * a reference in the table: it fills the box and asks.
 */
export function CookieChoiceLookup({
  request,
  onViewRecord,
}: {
  request: CookieChoiceLookupRequest | null;
  onViewRecord?: (reference: string) => void;
}) {
  const t = useTranslations("adminGdpr");
  const titleId = useId();
  const inputId = useId();
  const hintId = useId();
  const [input, setInput] = useState("");
  // The "not a full reference" hint waits until the admin has left the box or tried Enter.
  const [touched, setTouched] = useState(false);
  const [state, setState] = useState<LookupState>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const lastReference = useRef("");

  const run = useCallback(async (reference: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    lastReference.current = reference;
    setState({ status: "loading" });
    try {
      const res = await fetch(`/api/admin/gdpr/consent/receipt?ref=${encodeURIComponent(reference)}`, { signal: controller.signal });
      const result = res.ok ? parseLookupResult(await res.json()) : null;
      // A newer lookup has replaced this one: its answer is the one to show.
      if (controller.signal.aborted) return;
      setState(result ? { status: "done", result, reference } : { status: "error" });
    } catch {
      if (!controller.signal.aborted) setState({ status: "error" });
    }
  }, []);

  useEffect(() => {
    if (!request) return;
    setInput(request.reference);
    void run(request.reference);
  }, [request, run]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // A pasted reference is often upper-case or has stray spaces; the app writes them in lower case.
  const reference = input.trim().toLowerCase();
  const valid = isReceiptId(reference);
  const loading = state.status === "loading";
  // Nobody should be told they are wrong from the first keystroke: the hint shows after the box is
  // left, after Enter on an incomplete value, or once the value is as long as a reference.
  const showInvalid = input.trim() !== "" && !valid && (touched || input.trim().length >= REFERENCE_LENGTH);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (valid && !loading) void run(reference);
  };

  const result = state.status === "done" ? state.result : null;
  const resultReference = state.status === "done" ? state.reference : "";

  return (
    <div role="group" aria-labelledby={titleId} className="space-y-3">
      <div className="space-y-1">
        <h3 id={titleId} className="text-sm font-semibold text-foreground">{t("cookieLookupTitle")}</h3>
        <p className="text-xs text-muted-foreground">{t("cookieLookupHelp")}</p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor={inputId}>{t("cookieLookupInputLabel")}</Label>
          <Input
            id={inputId}
            dir="ltr"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onBlur={() => setTouched(true)}
            onKeyDown={(e) => { if (e.key === "Enter" && !valid) setTouched(true); }}
            placeholder={t("cookieLookupInputPlaceholder")}
            autoComplete="off"
            spellCheck={false}
            maxLength={80}
            aria-invalid={showInvalid}
            aria-describedby={showInvalid ? hintId : undefined}
            className="min-h-11 font-mono sm:min-h-10"
          />
          {showInvalid && (
            <p id={hintId} className="text-xs text-muted-foreground">
              {t("cookieLookupInvalid")}
            </p>
          )}
        </div>
        <Button type="submit" className="min-h-11 shrink-0 sm:min-h-10" disabled={!valid || loading} aria-busy={loading}>
          {loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Search aria-hidden="true" />}
          {loading ? t("cookieLookupPending") : t("cookieLookupButton")}
        </Button>
      </form>

      <div aria-live="polite" aria-busy={loading}>
        {loading && <ResultSkeleton />}

        {state.status === "error" && (
          <ErrorState
            className="py-6 sm:py-6"
            title={t("cookieLookupErrorTitle")}
            description={t("cookieLookupErrorHelp")}
            retryLabel={t("cookieChoiceRetry")}
            onRetry={() => void run(lastReference.current)}
          />
        )}

        {result && result.receipts.length > 0 && (
          <>
            <ul className="space-y-3">
              {result.receipts.map((receipt, index) => (
                <ReceiptRow
                  key={`${receipt.receiptId}-${receipt.createdAt}-${index}`}
                  receipt={receipt}
                  fallbackSource={result.linkedAccount?.source ?? null}
                />
              ))}
            </ul>
            <LinkedAccountLine result={result} reference={resultReference} onViewRecord={onViewRecord} />
          </>
        )}

        {result && result.receipts.length === 0 && result.linkedAccount && (
          <>
            <p className="text-sm text-muted-foreground">{t("cookieLookupGone")}</p>
            <LinkedAccountLine result={result} reference={resultReference} onViewRecord={onViewRecord} />
          </>
        )}

        {result && result.receipts.length === 0 && !result.linkedAccount && (
          <EmptyState
            className="py-6 sm:py-6"
            icon={SearchX}
            title={t("cookieLookupNotFoundTitle")}
            description={t("cookieLookupNotFoundHelp")}
          />
        )}
      </div>
    </div>
  );
}
