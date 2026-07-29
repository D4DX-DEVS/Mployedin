"use client";

import { useRef } from "react";
import { useFormContext } from "react-hook-form";
import { useLocale, useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { DollarSign, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { cn } from "@/lib/utils";
import {
  CURRENCIES,
  SALARY_PERIODS,
  SALARY_PRESETS,
  type JobFormValues,
  type CurrencyCode,
} from "./jobFormSchema";
import { requiresSalaryDisclosure } from "@/lib/job-attributes/salary-jurisdictions";
import { SalaryBenchmarkWidget } from "./SalaryBenchmarkWidget";

export function Step4SalarySettings() {
  const t = useTranslations("employerJobForm.step4");
  const locale = useLocale();
  const numberLocale = locale === "ar" ? "ar-SA" : "en-US";
  const {
    register,
    watch,
    setValue,
    formState: { errors },
  } = useFormContext<JobFormValues>();

  const currency = (watch("salary.currency") ?? "USD") as CurrencyCode;
  const period = watch("salary.period") ?? "monthly";
  const isNegotiable = watch("salary.isNegotiable");
  const salaryMin = watch("salary.min");
  const salaryMax = watch("salary.max");
  const vacancies = watch("vacancies");
  const showSalary = watch("showSalary") ?? true;
  const hasVacancyCount = vacancies != null;
  const locationCountry = watch("location.country") ?? "";
  const locationCity = watch("location.city") ?? "";
  const locationStr = [locationCity, locationCountry].filter(Boolean).join(", ");
  const salaryRequired = requiresSalaryDisclosure(locationStr);
  const jobTitle = watch("title") ?? "";
  const lastVisibleSalaryRef = useRef({ min: 0, max: 0, isNegotiable: false });

  const presets = SALARY_PRESETS[currency] ?? [];
  const currencyNames = new Intl.DisplayNames([locale], { type: "currency" });

  function formatAmount(amount: number, salaryCurrency = currency) {
    return new Intl.NumberFormat(numberLocale, {
      style: "currency",
      currency: salaryCurrency || "USD",
      maximumFractionDigits: 0,
    }).format(amount);
  }

  function formatRange(min: number, max: number, rangePeriod = period) {
    const periodLabel = t(`salaryPeriods.${rangePeriod as "monthly" | "yearly" | "lpa"}`);
    return `${formatAmount(min)} - ${formatAmount(max)} (${periodLabel})`;
  }

  function applyPreset(preset: { min: number; max: number; period?: string }) {
    setValue("salary.min", preset.min, { shouldValidate: true });
    setValue("salary.max", preset.max, { shouldValidate: true });
    if (preset.period) {
      setValue("salary.period", preset.period as "monthly" | "yearly" | "lpa", {
        shouldValidate: true,
      });
    }
  }

  const formattedRange =
    salaryMin > 0 && salaryMax > 0
      ? formatRange(salaryMin, salaryMax)
      : null;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.25 }}
      className="space-y-3 sm:space-y-5"
    >
      <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-muted/20 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("description")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs">
            {showSalary ? t("salaryVisible") : t("salaryHidden")}
          </Badge>
          <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs">
            {formattedRange ?? t("addSalaryRange")}
          </Badge>
          <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs">
            {hasVacancyCount ? t("openings", { count: vacancies ?? 0 }) : t("openingsHidden")}
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(17rem,0.9fr)]">
        <div className="space-y-3 sm:space-y-4 rounded-2xl border border-border bg-background p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <DollarSign className="w-4 h-4 text-muted-foreground" />
            {t("salaryPackage")}
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-muted/20 p-3">
            <div className="flex-1">
              <p className="text-sm font-medium">{t("shareSalary")}</p>
              <p className="text-xs text-muted-foreground">
                {t("shareSalaryHint")}
              </p>
            </div>
            <Switch
              checked={showSalary}
              onCheckedChange={(value) => {
                setValue("showSalary", value, { shouldValidate: false });
                if (!value) {
                  lastVisibleSalaryRef.current = {
                    min: salaryMin,
                    max: salaryMax,
                    isNegotiable,
                  };
                  setValue("salary.min", 0, { shouldValidate: true });
                  setValue("salary.max", 0, { shouldValidate: true });
                  setValue("salary.isNegotiable", false, { shouldValidate: false });
                } else {
                  setValue("salary.min", lastVisibleSalaryRef.current.min, { shouldValidate: true });
                  setValue("salary.max", lastVisibleSalaryRef.current.max, { shouldValidate: true });
                  setValue("salary.isNegotiable", lastVisibleSalaryRef.current.isNegotiable, {
                    shouldValidate: false,
                  });
                }
              }}
            />
          </div>

          {showSalary ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="currency" className="text-xs text-muted-foreground">
                    {t("currency")}
                  </Label>
                  <SearchableSelect
                    id="currency"
                    options={CURRENCIES.map((c) => ({
                      value: c.code,
                      label: `${c.code} - ${currencyNames.of(c.code) ?? c.label}`,
                    }))}
                    value={currency}
                    onValueChange={(v) =>
                      setValue("salary.currency", v, { shouldValidate: true })
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="period" className="text-xs text-muted-foreground">
                    {t("payPeriod")}
                  </Label>
                  <SearchableSelect
                    id="period"
                    options={SALARY_PERIODS.filter(
                      (p) => p.value !== "lpa" || currency === "INR"
                    ).map((p) => ({ value: p.value, label: t(`salaryPeriods.${p.value}`) }))}
                    value={period}
                    onValueChange={(v) =>
                      setValue("salary.period", v as "monthly" | "yearly" | "lpa", {
                        shouldValidate: true,
                      })
                    }
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="salary-min" className="text-xs text-muted-foreground">
                    {t("minimum")}
                  </Label>
                  <Input
                    id="salary-min"
                    type="number"
                    min={0}
                    step={100}
                    {...register("salary.min", { valueAsNumber: true })}
                    className={cn(errors.salary && "border-destructive")}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="salary-max" className="text-xs text-muted-foreground">
                    {t("maximum")}
                  </Label>
                  <Input
                    id="salary-max"
                    type="number"
                    min={0}
                    step={100}
                    {...register("salary.max", { valueAsNumber: true })}
                    className={cn(errors.salary && "border-destructive")}
                    placeholder="0"
                  />
                </div>
              </div>

              {formattedRange && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm"
                >
                  <span className="font-semibold text-primary">{formattedRange}</span>
                  <span className="ms-2 text-muted-foreground">{t("shownToCandidates")}</span>
                </motion.div>
              )}

              {errors.salary && (
                <p className="text-xs text-destructive">{t("salaryError")}</p>
              )}

              {presets.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-medium text-muted-foreground">{t("quickPresets")}</span>
                  <div className="flex flex-wrap gap-2">
                    {presets.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => applyPreset(preset)}
                        className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/[0.04] hover:text-foreground"
                      >
                        {formatRange(
                          preset.min,
                          preset.max,
                          (preset.period as "monthly" | "yearly" | "lpa" | undefined) ?? period
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-muted/20 p-3">
                <div className="flex-1">
                  <p className="text-sm font-medium">{t("negotiable")}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("negotiableHint")}
                  </p>
                </div>
                <Switch
                  checked={isNegotiable}
                  onCheckedChange={(v) =>
                    setValue("salary.isNegotiable", v, { shouldValidate: false })
                  }
                />
              </div>

              <SalaryBenchmarkWidget
                role={jobTitle}
                location={locationStr}
                currency={currency}
                period={period}
                salaryMin={salaryMin}
                salaryMax={salaryMax}
                onAdjust={(min, max) => {
                  setValue("salary.min", min, { shouldValidate: true });
                  setValue("salary.max", max, { shouldValidate: true });
                }}
              />
            </>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                {t("undisclosedHint")}
              </div>
              {salaryRequired && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
                  <span className="mt-0.5">⚠️</span>
                  <span>{t("salaryDisclosureWarning", { location: locationStr })}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-3 sm:space-y-4 rounded-2xl border border-border bg-background p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Users className="w-4 h-4 text-muted-foreground" />
            {t("hiringPlan")}
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-muted/20 p-3">
            <div className="flex-1">
              <Label htmlFor="vacancies" className="text-sm font-medium">
                {t("trackOpenings")}
              </Label>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("trackOpeningsHint")}
              </p>
            </div>
            <Switch
              checked={hasVacancyCount}
              onCheckedChange={(value) =>
                setValue("vacancies", value ? Math.max(vacancies ?? 1, 1) : undefined, {
                  shouldValidate: true,
                })
              }
            />
          </div>

          {hasVacancyCount ? (
            <div className="space-y-3 rounded-xl border border-border/70 bg-background p-3">
              <Input
                id="vacancies"
                type="number"
                min={1}
                max={100}
                {...register("vacancies", {
                  setValueAs: (value) => value === "" || isNaN(Number(value)) ? undefined : Number(value),
                })}
                className="w-32"
              />
              <p className="text-xs text-muted-foreground">
                {t("showOpeningsHint")}
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              {t("noOpeningsHint")}
            </div>
          )}

          <div className="rounded-xl border border-border/70 bg-muted/20 p-3 text-xs text-muted-foreground">
            {t("advancedHint")}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
