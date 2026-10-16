"use client";

import { useLocale, useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { PERIOD_TYPES, type PeriodType, type SplitStrategy } from "@/lib/targets/schedule";
import {
  draftIssues,
  withAddedPeriod,
  withAmount,
  withPeriodAmount,
  withPeriodField,
  withPeriodType,
  withRemovedPeriod,
  withStrategy,
  type ScheduleDraft,
} from "@/lib/targets/scheduleDraft";
import { fromCents, toCents } from "@/lib/targets/schedule";
import { formatPeriodRange, usePeriodNamer } from "./periodLabels";
import { formatProfit } from "./profitFormat";

const STRATEGIES: SplitStrategy[] = ["equal", "seasonal", "custom"];

/** Why a draft cannot be saved, as one line in the viewer's language; null when it can. */
export function useScheduleIssue(draft: ScheduleDraft, year: number, profitTarget: number, currency: string): string | null {
  const t = useTranslations("profitTargets");
  const locale = useLocale();
  const [issue] = draftIssues(draft, year, profitTarget);
  if (!issue) return null;
  if (issue.code === "sum") {
    const sum = fromCents(draft.periods.reduce((total, period) => total + toCents(period.profitTarget), 0));
    return t("splitMismatch", { total: formatProfit(sum, currency, locale), annual: formatProfit(profitTarget, currency, locale) });
  }
  return t(`scheduleIssue_${issue.code}`);
}

/* ------------------------------------------------------------------ */
/*  Type + split                                                       */
/* ------------------------------------------------------------------ */

/**
 * The two choices that shape a schedule: how the year is cut (annual,
 * quarterly, monthly, weekly or custom) and how the amount falls over the cuts
 * (equal, seasonal, or typed by hand). Compact, to sit in a table row.
 */
export function ScheduleControls({ draft, year, profitTarget, onChange, disabled = false, className = "" }: {
  draft: ScheduleDraft;
  year: number;
  profitTarget: number;
  onChange: (next: ScheduleDraft) => void;
  disabled?: boolean;
  className?: string;
}) {
  const t = useTranslations("profitTargets");
  const tr = useTranslations("profitReport");

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <SearchableSelect
        options={PERIOD_TYPES.map((type) => ({ value: type, label: tr(`period_${type}`) }))}
        value={draft.periodType}
        onValueChange={(value) => onChange(withPeriodType(draft, year, profitTarget, value as PeriodType))}
        placeholder={t("periodTypeLabel")}
        className="h-9 min-w-32 flex-1 rounded-lg text-xs"
        disabled={disabled}
        aria-label={t("periodTypeLabel")}
      />
      {draft.periodType !== "annual" && (
        <SearchableSelect
          options={STRATEGIES.map((strategy) => ({ value: strategy, label: t(`strategy_${strategy}`) }))}
          value={draft.strategy}
          onValueChange={(value) => onChange(withStrategy(draft, profitTarget, value as SplitStrategy))}
          placeholder={t("strategyLabel")}
          className="h-9 min-w-28 flex-1 rounded-lg text-xs"
          disabled={disabled}
          aria-label={t("strategyLabel")}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  The periods themselves                                             */
/* ------------------------------------------------------------------ */

/**
 * The amount of every period, editable. A standard type shows its fixed
 * periods (typing an amount makes the split manual); a custom one lets the
 * owner name, date, add and remove periods. The badge says whether they add up.
 */
export function SchedulePeriodsEditor({ draft, year, profitTarget, currency, onChange }: {
  draft: ScheduleDraft;
  year: number;
  profitTarget: number;
  currency: string;
  onChange: (next: ScheduleDraft) => void;
}) {
  const t = useTranslations("profitTargets");
  const locale = useLocale();
  const name = usePeriodNamer();
  const issue = useScheduleIssue(draft, year, profitTarget, currency);
  const sum = fromCents(draft.periods.reduce((total, period) => total + toCents(period.profitTarget), 0));
  const custom = draft.periodType === "custom";

  const status = (
    <span
      role={issue ? "alert" : undefined}
      className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tabular-nums ${
        issue ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"
      }`}
    >
      {issue ?? t("splitMatches", { total: formatProfit(sum, currency, locale) })}
    </span>
  );

  if (draft.periodType === "annual") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{t("annualHint", { year })}</p>
        {status}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-muted-foreground">{t("scheduleLabel")}</p>
        {status}
      </div>

      {custom ? (
        <div className="space-y-2">
          {draft.periods.map((period, index) => (
            <div key={index} className="grid items-end gap-2 rounded-xl border border-border/60 bg-background p-2 sm:grid-cols-[1.2fr_1fr_1fr_1fr_auto]">
              <label className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
                {t("periodName")}
                <Input
                  value={period.label ?? ""}
                  maxLength={60}
                  placeholder={name(period, "custom", index, year)}
                  onChange={(event) => onChange(withPeriodField(draft, profitTarget, index, "label", event.target.value))}
                  className="h-9 rounded-lg text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
                {t("periodStart")}
                <Input
                  type="date"
                  min={`${year}-01-01`}
                  max={`${year}-12-31`}
                  value={period.startDate}
                  onChange={(event) => onChange(withPeriodField(draft, profitTarget, index, "startDate", event.target.value))}
                  className="h-9 rounded-lg text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
                {t("periodEnd")}
                <Input
                  type="date"
                  min={`${year}-01-01`}
                  max={`${year}-12-31`}
                  value={period.endDate}
                  onChange={(event) => onChange(withPeriodField(draft, profitTarget, index, "endDate", event.target.value))}
                  className="h-9 rounded-lg text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
                {t("periodAmount")}
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={period.profitTarget || ""}
                  onChange={(event) => onChange(withPeriodAmount(draft, index, Number(event.target.value) || 0))}
                  className="h-9 rounded-lg text-center text-sm tabular-nums"
                />
              </label>
              <Button
                type="button"
                variant="ghost"
                size="dense"
                className="h-9 rounded-lg text-muted-foreground hover:text-rose-600"
                aria-label={t("removePeriod")}
                disabled={draft.periods.length <= 1}
                onClick={() => onChange(withRemovedPeriod(draft, profitTarget, index))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 rounded-lg"
            onClick={() => onChange(withAddedPeriod(draft, year, profitTarget))}
          >
            <Plus className="h-3.5 w-3.5" /> {t("addPeriod")}
          </Button>
        </div>
      ) : (
        // Weekly has 53 periods: it scrolls inside its own box instead of lengthening the page.
        <div className={`grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 ${draft.periods.length > 12 ? "max-h-80 overflow-y-auto pe-1" : ""}`}>
          {draft.periods.map((period, index) => (
            <label key={period.startDate} className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
              <span>
                {name(period, draft.periodType, index, year)}
                {draft.periodType === "weekly" || draft.periodType === "quarterly" ? (
                  <span className="ms-1 font-normal opacity-80">{formatPeriodRange(period, locale)}</span>
                ) : null}
              </span>
              <Input
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={period.profitTarget || ""}
                onChange={(event) => onChange(withPeriodAmount(draft, index, Number(event.target.value) || 0))}
                className="h-9 rounded-lg border-border bg-background text-center text-sm tabular-nums"
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Both together                                                      */
/* ------------------------------------------------------------------ */

/** The controls and the periods in one block, for forms that are not a table row. */
export function TargetScheduleEditor(props: {
  draft: ScheduleDraft;
  year: number;
  profitTarget: number;
  currency: string;
  onChange: (next: ScheduleDraft) => void;
}) {
  return (
    <div className="space-y-3">
      <ScheduleControls draft={props.draft} year={props.year} profitTarget={props.profitTarget} onChange={props.onChange} />
      <SchedulePeriodsEditor {...props} />
    </div>
  );
}

/** A new amount typed into a form: re-spreads the draft unless it was typed by hand. */
export function draftWithAmount(draft: ScheduleDraft, year: number, profitTarget: number): ScheduleDraft {
  return withAmount(draft, year, profitTarget);
}
