"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CheckCircle2, ListChecks, SlidersHorizontal, XCircle, type LucideIcon } from "lucide-react";
import { ErrorState } from "@/components/shared/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { formatCount } from "@/lib/ui/intlFormat";
import { cn } from "@/lib/utils";
import { COOKIE_CHOICE_PERIODS, type CookieChoicePeriod } from "@/lib/gdpr/cookieChoiceOutcome";
import { parseSummary, type CookieChoiceSummaryData } from "./cookieChoice";

type SummaryState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; data: CookieChoiceSummaryData };

interface Card {
  key: string;
  label: string;
  value: number;
  /** Shown as "N% of total" on every card after Total. */
  share: boolean;
  icon: LucideIcon;
  tone: string;
}

/** A whole percent of the total; 0 when nobody chose (never NaN). */
const percentOf = (value: number, total: number): number => (total > 0 ? Math.round((value / total) * 100) : 0);

interface ConsentStatCardsProps {
  days: CookieChoicePeriod;
  onDaysChange: (days: CookieChoicePeriod) => void;
}

/**
 * The Consent Logs tab's four cookie-choice cards, in place of the data-request
 * cards: Total choices, Accepted all, Rejected all and Custom choices, with
 * each share of the total, over the period picked here (which also filters the
 * cookie choices table). Counts every choice, signed in or not: one choice is
 * counted once, and someone who changes their choice is counted again. Every
 * figure has words and an icon, so nothing relies on colour.
 */
export function ConsentStatCards({ days, onDaysChange }: ConsentStatCardsProps) {
  const t = useTranslations("adminGdpr");
  const locale = useLocale();
  const titleId = useId();
  const [state, setState] = useState<SummaryState>({ status: "loading" });
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ status: "loading" });
    try {
      const res = await fetch(`/api/admin/gdpr/consent/summary?days=${days}`, { signal: controller.signal });
      const data = res.ok ? parseSummary(await res.json()) : null;
      if (controller.signal.aborted) return;
      setState(data ? { status: "ready", data } : { status: "error" });
    } catch {
      if (!controller.signal.aborted) setState({ status: "error" });
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const periodLabels: Record<CookieChoicePeriod, string> = {
    7: t("cookiePeriod7"),
    30: t("cookiePeriod30"),
    90: t("cookiePeriod90"),
    365: t("cookiePeriod365"),
  };

  const data = state.status === "ready" ? state.data : null;
  const cards: Card[] = data
    ? [
        { key: "total", label: t("cookieSummaryTotal"), value: data.total, share: false, icon: ListChecks, tone: "bg-sky-100 text-sky-700" },
        { key: "accepted", label: t("cookieOutcomeAcceptedAll"), value: data.acceptedAll, share: true, icon: CheckCircle2, tone: "bg-emerald-100 text-emerald-700" },
        { key: "rejected", label: t("cookieOutcomeRejectedAll"), value: data.rejectedAll, share: true, icon: XCircle, tone: "bg-amber-100 text-amber-700" },
        { key: "custom", label: t("cookieCardCustom"), value: data.custom, share: true, icon: SlidersHorizontal, tone: "bg-violet-100 text-violet-700" },
      ]
    : [];

  return (
    <section aria-labelledby={titleId} aria-busy={state.status === "loading"} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={titleId} className="text-sm font-semibold text-foreground">{t("cookieSummaryTitle")}</h2>
        <SearchableSelect
          options={COOKIE_CHOICE_PERIODS.map((value) => ({ value: String(value), label: periodLabels[value] }))}
          value={String(days)}
          onValueChange={(value) => onDaysChange(Number(value) as CookieChoicePeriod)}
          placeholder={t("cookiePeriodLabel")}
          ariaLabel={t("cookiePeriodLabel")}
          className="h-11 w-44 rounded-lg border-border bg-card text-sm sm:h-9"
        />
      </div>

      {state.status === "loading" && (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" data-testid="cookie-cards-skeleton">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="workspace-panel-surface flex items-start gap-3 rounded-2xl p-3 sm:gap-4 sm:p-4">
              <Skeleton className="size-9 shrink-0 rounded-xl sm:size-11" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-6 w-12" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
          ))}
        </div>
      )}

      {state.status === "error" && (
        <ErrorState className="py-6 sm:py-6" title={t("cookieSummaryError")} retryLabel={t("cookieChoiceRetry")} onRetry={() => void load()} />
      )}

      {data && (
        <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {cards.map(({ key, label, value, share, icon: Icon, tone }) => (
            <li key={key} data-stat-card={key} className="workspace-panel-surface flex min-w-0 items-start gap-3 rounded-2xl p-3 sm:gap-4 sm:p-4">
              <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl sm:size-11", tone)}>
                <Icon className="size-4 sm:size-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-semibold leading-tight tabular-nums text-foreground sm:text-2xl">
                  {formatCount(value, undefined, locale)}
                </span>
                <span className="mt-0.5 block truncate text-xs font-semibold text-foreground sm:text-sm">{label}</span>
                {share && (
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {t("cookieCardShare", { percent: formatCount(percentOf(value, data.total), undefined, locale) })}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">{t("cookieSummaryHelp")}</p>
    </section>
  );
}
