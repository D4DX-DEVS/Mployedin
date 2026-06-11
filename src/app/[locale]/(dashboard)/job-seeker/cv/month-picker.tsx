"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Modern month/year picker that replaces the native `<input type="month">`.
 * Value is a "YYYY-MM" string (matching the previous native input contract).
 */
export function MonthYearPicker({
  label,
  value,
  onChange,
  placeholder,
  disabled,
  minYear = 1960,
  maxYear = new Date().getFullYear() + 10,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  minYear?: number;
  maxYear?: number;
}) {
  const locale = useLocale();
  const t = useTranslations("cvBuilderPage.monthPicker");

  const parsed = /^(\d{4})-(\d{2})$/.exec(value);
  const selectedYear = parsed ? parseInt(parsed[1], 10) : null;
  const selectedMonth = parsed ? parseInt(parsed[2], 10) : null; // 1-12

  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(selectedYear ?? new Date().getFullYear());

  const monthFmt = new Intl.DateTimeFormat(locale, { month: "short" });
  const monthLong = new Intl.DateTimeFormat(locale, { month: "long" });
  const months = Array.from({ length: 12 }, (_, i) => ({
    num: i + 1,
    short: monthFmt.format(new Date(2020, i, 1)),
  }));

  const displayLabel =
    selectedYear && selectedMonth
      ? `${monthLong.format(new Date(selectedYear, selectedMonth - 1, 1))} ${selectedYear}`
      : (placeholder ?? t("placeholder"));

  function selectMonth(month: number) {
    onChange(`${viewYear}-${String(month).padStart(2, "0")}`);
    setOpen(false);
  }

  return (
    <div className="space-y-1.5">
      {label && <Label className="text-xs text-muted-foreground">{label}</Label>}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={cn(
              "flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-colors",
              "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
              "disabled:cursor-not-allowed disabled:opacity-50",
              !value && "text-muted-foreground",
            )}
          >
            <span className="truncate">{displayLabel}</span>
            <Calendar className="h-4 w-4 shrink-0 opacity-60" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3" align="start">
          {/* Year navigation */}
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setViewYear((y) => Math.max(minYear, y - 1))}
              disabled={viewYear <= minYear}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
              aria-label={t("prevYear")}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold">{viewYear}</span>
            <button
              type="button"
              onClick={() => setViewYear((y) => Math.min(maxYear, y + 1))}
              disabled={viewYear >= maxYear}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
              aria-label={t("nextYear")}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Month grid */}
          <div className="grid grid-cols-3 gap-1.5">
            {months.map((m) => {
              const isSelected = selectedYear === viewYear && selectedMonth === m.num;
              return (
                <button
                  key={m.num}
                  type="button"
                  onClick={() => selectMonth(m.num)}
                  className={cn(
                    "rounded-md py-1.5 text-xs font-medium capitalize transition-colors",
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-muted",
                  )}
                >
                  {m.short}
                </button>
              );
            })}
          </div>

          {/* Footer actions */}
          <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2.5">
            <button
              type="button"
              onClick={() => { onChange(""); setOpen(false); }}
              className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("clear")}
            </button>
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                setViewYear(now.getFullYear());
                selectMonth(now.getMonth() + 1);
              }}
              className="text-xs font-medium text-primary transition-colors hover:text-primary/80"
            >
              {t("thisMonth")}
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
