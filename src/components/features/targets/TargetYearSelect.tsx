"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InlineLabelled } from "@/components/shared/LabelledControl";

/** The years a target page offers: next year (planning) back three years, unless the caller knows better. */
export function defaultTargetYears(now: Date = new Date()): string[] {
  const year = now.getFullYear();
  return [year + 1, year, year - 1, year - 2, year - 3].map(String);
}

/**
 * Year picker shared by the target pages. A year outside `years` (a shared link) is still shown, never dropped.
 * The label shows beside the box. Pass `showLabel={false}` with `id` where the caller already shows one (a
 * filter sheet's FilterField), so the year is not labelled twice.
 */
export function TargetYearSelect({ value, onChange, label, years = defaultTargetYears(), id, showLabel = true }: {
  value: string;
  onChange: (year: string) => void;
  label: string;
  years?: string[];
  id?: string;
  showLabel?: boolean;
}) {
  const options = years.includes(value) ? years : [value, ...years];
  const select = (triggerId?: string) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        id={triggerId}
        aria-label={triggerId ? undefined : label}
        className="h-10 w-[8.5rem] rounded-xl border-border/70 bg-background/90 text-sm"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>{option}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  if (!showLabel) return select(id);
  return <InlineLabelled label={label}>{(autoId) => select(id ?? autoId)}</InlineLabelled>;
}
