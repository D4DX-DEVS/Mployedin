"use client";

import { useLocale, useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { formatProfit } from "@/components/features/targets/profitFormat";
import type { KpiMonthFigures, KpiTotals } from "@/lib/targets/kpiSchedule";
import { ManualMonthsEditor } from "./ManualMonthsEditor";

export interface SupervisorRow {
  id: string;
  name: string;
  email: string;
  teamSize: number;
  territory: string;
  currency: string;
  /** `available`, or why a target cannot be set for this supervisor now. */
  availability: "available" | "has_active_target" | "inactive";
}

export interface TargetDraft {
  totals: KpiTotals;
  split: "equal" | "custom";
  months: KpiMonthFigures[];
}

/** Desktop and phone share one grid: a header row above (md+) and labelled fields below md. */
export const TARGET_GRID = "md:grid md:grid-cols-[minmax(200px,1.5fr)_repeat(3,minmax(120px,1fr))_minmax(130px,0.9fr)] md:items-start md:gap-4";

interface SupervisorTargetRowProps {
  supervisor: SupervisorRow;
  draft: TargetDraft;
  year: number;
  onTotal: (id: string, field: keyof KpiTotals, value: number) => void;
  onSplit: (id: string, split: "equal" | "custom") => void;
  onMonths: (id: string, months: KpiMonthFigures[]) => void;
}

export function SupervisorTargetRow({ supervisor, draft, year, onTotal, onSplit, onMonths }: SupervisorTargetRowProps) {
  const t = useTranslations("profitTargets");
  const locale = useLocale();
  const locked = supervisor.availability !== "available";
  const hasTarget = draft.totals.jobTarget > 0 || draft.totals.conversionTarget > 0 || draft.totals.revenueTarget > 0;

  const perMonth = (field: keyof KpiTotals) => {
    const value = draft.totals[field] / 12;
    if (!(value > 0)) return null;
    const shown = field === "revenueTarget" ? formatProfit(value, supervisor.currency, locale) : String(Math.round(value * 10) / 10);
    return t("perMonthHint", { value: shown });
  };

  const field = (key: keyof KpiTotals, label: string, unit: string) => (
    <div>
      <Label htmlFor={`${key}-${supervisor.id}`} className="mb-1 block text-xs font-medium text-muted-foreground md:sr-only">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={`${key}-${supervisor.id}`}
          type="number"
          min={0}
          step={key === "revenueTarget" ? "0.01" : "1"}
          inputMode={key === "revenueTarget" ? "decimal" : "numeric"}
          value={draft.totals[key] || ""}
          onChange={(e) => onTotal(supervisor.id, key, Number(e.target.value) || 0)}
          placeholder="0"
          disabled={locked}
          className="h-11 w-full rounded-lg pe-12 text-end tabular-nums md:h-9"
        />
        {unit && (
          <span className="pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 text-[11px] font-medium text-muted-foreground">{unit}</span>
        )}
      </div>
      <p className="mt-1 min-h-4 text-[11px] text-muted-foreground">{perMonth(key)}</p>
    </div>
  );

  return (
    <div className={`space-y-3 px-4 py-3 ${hasTarget ? "bg-sky-50/50" : ""}`}>
      <div className={`grid grid-cols-2 gap-3 ${TARGET_GRID}`}>
        <div className="col-span-2 min-w-0 md:col-span-1">
          <p className="truncate font-medium text-foreground">{supervisor.name}</p>
          <p className="truncate text-xs text-muted-foreground">{supervisor.email}</p>
          {supervisor.territory && <p className="truncate text-xs text-muted-foreground">{supervisor.territory}</p>}
          {locked && (
            <Badge variant="outline" className="mt-1 text-[11px]">
              {supervisor.availability === "inactive" ? t("supervisorInactive") : t("alreadyHasTarget", { year })}
            </Badge>
          )}
        </div>
        {field("jobTarget", t("jobTargetShort"), "")}
        {field("conversionTarget", t("conversionTargetShort"), "")}
        {field("revenueTarget", t("revenueTargetShort"), supervisor.currency)}
        <div>
          <Label htmlFor={`split-${supervisor.id}`} className="mb-1 block text-xs font-medium text-muted-foreground md:sr-only">
            {t("monthlySplitHeader")}
          </Label>
          <SearchableSelect
            id={`split-${supervisor.id}`}
            ariaLabel={t("monthlySplitHeader")}
            value={draft.split}
            onValueChange={(val) => onSplit(supervisor.id, val === "custom" ? "custom" : "equal")}
            options={[
              { value: "equal", label: t("strategy_equal") },
              { value: "custom", label: t("strategy_custom") },
            ]}
            disabled={!hasTarget || locked}
            className="h-11 w-full rounded-lg text-sm md:h-9"
          />
        </div>
      </div>
      {draft.split === "custom" && hasTarget && !locked && (
        <ManualMonthsEditor
          rowId={supervisor.id}
          name={supervisor.name}
          year={year}
          currency={supervisor.currency}
          totals={draft.totals}
          months={draft.months}
          onChange={(months) => onMonths(supervisor.id, months)}
        />
      )}
    </div>
  );
}
