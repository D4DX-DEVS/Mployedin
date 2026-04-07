"use client";

import { useFormContext } from "react-hook-form";
import { motion } from "framer-motion";
import { DollarSign, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  CURRENCIES,
  SALARY_PERIODS,
  SALARY_PRESETS,
  formatSalary,
  type JobFormValues,
  type CurrencyCode,
} from "./jobFormSchema";
import { requiresSalaryDisclosure } from "@/lib/job-attributes/salary-jurisdictions";
import { SalaryBenchmarkWidget } from "./SalaryBenchmarkWidget";

export function Step4SalarySettings() {
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
  const locationCountry = watch("location.country") ?? "";
  const locationCity = watch("location.city") ?? "";
  const locationStr = [locationCity, locationCountry].filter(Boolean).join(", ");
  const salaryRequired = requiresSalaryDisclosure(locationStr);
  const jobTitle = watch("title") ?? "";

  const presets = SALARY_PRESETS[currency] ?? [];

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
    salaryMin > 0 || salaryMax > 0
      ? `${formatSalary(salaryMin, currency, period)} – ${formatSalary(salaryMax, currency, period)}`
      : null;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      <div>
        <h2 className="text-lg font-semibold text-foreground">Salary &amp; Settings</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Jobs with salary transparency get 3× more applicants.
        </p>
      </div>

      {/* Salary Package */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <DollarSign className="w-4 h-4 text-muted-foreground" />
          Salary Package
        </div>

        {/* Currency + Period */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="currency" className="text-xs text-muted-foreground">
              Currency
            </Label>
            <Select
              value={currency}
              onValueChange={(v) =>
                setValue("salary.currency", v, { shouldValidate: true })
              }
            >
              <SelectTrigger id="currency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="period" className="text-xs text-muted-foreground">
              Pay Period
            </Label>
            <Select
              value={period}
              onValueChange={(v) =>
                setValue("salary.period", v as "monthly" | "yearly" | "lpa", {
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger id="period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SALARY_PERIODS.filter(
                  (p) => p.value !== "lpa" || currency === "INR"
                ).map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Min + Max */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="salary-min" className="text-xs text-muted-foreground">
              Minimum
            </Label>
            <div className="relative">
              <Input
                id="salary-min"
                type="number"
                min={0}
                step={100}
                {...register("salary.min", { valueAsNumber: true })}
                className={cn(errors.salary && "border-destructive", "pl-3")}
                placeholder="0"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="salary-max" className="text-xs text-muted-foreground">
              Maximum
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

        {/* Formatted preview */}
        {formattedRange && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm"
          >
            <span className="font-semibold text-primary">{formattedRange}</span>
            <span className="text-muted-foreground ml-2">will be shown to candidates</span>
          </motion.div>
        )}

        {/* Salary error */}
        {errors.salary && (
          <p className="text-xs text-destructive">{String(errors.salary.message)}</p>
        )}

        {/* Preset quick picks */}
        {presets.length > 0 && (
          <div className="space-y-2">
            <span className="text-xs text-muted-foreground font-medium">Quick presets</span>
            <div className="flex flex-wrap gap-2">
              {presets.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className="px-3 py-1 text-xs rounded-full border border-border hover:bg-accent hover:border-primary/40 transition-colors"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Salary Benchmark Widget */}
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

        {/* Negotiable toggle */}
        <div className="flex items-center gap-3 p-3 rounded-lg border border-border">
          <div className="flex-1">
            <p className="text-sm font-medium">Negotiable</p>
            <p className="text-xs text-muted-foreground">
              Show &quot;Salary Negotiable&quot; label on the listing
            </p>
          </div>
          <Switch
            checked={isNegotiable}
            onCheckedChange={(v) =>
              setValue("salary.isNegotiable", v, { shouldValidate: false })
            }
          />
        </div>
      </div>

      {/* Show Salary toggle */}
      <div className="space-y-2">
        <div className="flex items-center gap-3 p-3 rounded-lg border border-border">
          <div className="flex-1">
            <p className="text-sm font-medium">Show Salary on Listing</p>
            <p className="text-xs text-muted-foreground">
              Candidates see the salary range on the public job board
            </p>
          </div>
          <Switch
            checked={showSalary}
            onCheckedChange={(v) =>
              setValue("showSalary", v, { shouldValidate: false })
            }
          />
        </div>
        {!showSalary && salaryRequired && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 text-xs">
            <span className="mt-0.5">⚠️</span>
            <span>
              Salary disclosure is <strong>required by law</strong> for job postings in{" "}
              {locationStr}. Hiding salary may violate local pay transparency regulations.
            </span>
          </div>
        )}
      </div>

      {/* Vacancies */}
      <div className="space-y-1.5">
        <Label htmlFor="vacancies" className="text-sm font-medium flex items-center gap-1.5">
          <Users className="w-4 h-4 text-muted-foreground" />
          Number of Openings
        </Label>
        <Input
          id="vacancies"
          type="number"
          min={1}
          max={100}
          {...register("vacancies", { valueAsNumber: true })}
          className="w-32"
        />
        <p className="text-xs text-muted-foreground">
          How many candidates you plan to hire for this role
        </p>
      </div>
    </motion.div>
  );
}
