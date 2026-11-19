"use client";

import { useLocale, useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/ui/intlFormat";
import { kpiPeriodIssues, type KpiMonthFigures, type KpiTotals } from "@/lib/targets/kpiSchedule";

interface ManualMonthsEditorProps {
  rowId: string;
  name: string;
  year: number;
  currency: string;
  totals: KpiTotals;
  months: KpiMonthFigures[];
  onChange: (months: KpiMonthFigures[]) => void;
}

const FIELDS = ["jobTarget", "conversionTarget", "revenueTarget"] as const;

/** Twelve months × three targets; each column must add up to its yearly target. */
export function ManualMonthsEditor({ rowId, name, year, currency, totals, months, onChange }: ManualMonthsEditorProps) {
  const t = useTranslations("profitTargets");
  const locale = useLocale();
  const issues = kpiPeriodIssues(months, totals);
  const sum = (key: keyof KpiMonthFigures) => months.reduce((s, m) => s + (m[key] || 0), 0);
  const label = { jobTarget: t("jobTargetShort"), conversionTarget: t("conversionTargetShort"), revenueTarget: `${t("revenueTargetShort")} (${currency})` };
  const off = {
    jobTarget: issues.includes("jobsSum"),
    conversionTarget: issues.includes("onboardedSum"),
    revenueTarget: issues.includes("revenueSum"),
  };

  const setCell = (index: number, key: keyof KpiMonthFigures, value: number) =>
    onChange(months.map((m, i) => (i === index ? { ...m, [key]: value } : m)));

  return (
    <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-3 sm:p-4">
      <div>
        <p className="text-sm font-medium text-foreground">{t("manualMonthsTitle", { name })}</p>
        <p className="text-xs text-muted-foreground">{t("manualMonthsHint")}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="py-1.5 pe-2 text-start font-medium">{t("monthColumn")}</th>
              {FIELDS.map((key) => (
                <th key={key} className="px-1 py-1.5 text-end font-medium">{label[key]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {months.map((month, i) => (
              <tr key={i}>
                <td className="py-1 pe-2 text-xs text-muted-foreground">
                  {formatDate(new Date(Date.UTC(year, i, 15)), { month: "short", timeZone: "UTC" }, locale)}
                </td>
                {FIELDS.map((key) => (
                  <td key={key} className="px-1 py-1">
                    <Input
                      type="number"
                      min={0}
                      step={key === "revenueTarget" ? "0.01" : "1"}
                      inputMode={key === "revenueTarget" ? "decimal" : "numeric"}
                      aria-label={`${label[key]} · ${formatDate(new Date(Date.UTC(year, i, 15)), { month: "long", timeZone: "UTC" }, locale)}`}
                      id={`${rowId}-${key}-${i}`}
                      value={month[key] || ""}
                      placeholder="0"
                      onChange={(e) => setCell(i, key, Number(e.target.value) || 0)}
                      className="h-9 text-end tabular-nums"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t text-xs">
              <td className="pt-2 pe-2 font-medium">{t("totalLabel")}</td>
              {FIELDS.map((key) => (
                <td key={key} className={`px-1 pt-2 text-end tabular-nums ${off[key] ? "font-semibold text-rose-600" : "text-muted-foreground"}`}>
                  {t("sumOfTotal", { sum: Math.round(sum(key) * 100) / 100, total: totals[key] })}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      {issues.includes("whole") && <p role="alert" className="text-xs text-rose-600">{t("manualWholeNumbers")}</p>}
    </div>
  );
}
