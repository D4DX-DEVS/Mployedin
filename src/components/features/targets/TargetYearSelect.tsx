"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** The years a target page offers: next year (planning) back three years, unless the caller knows better. */
export function defaultTargetYears(now: Date = new Date()): string[] {
  const year = now.getFullYear();
  return [year + 1, year, year - 1, year - 2, year - 3].map(String);
}

/** Year picker shared by the target pages. A year outside `years` (a shared link) is still shown, never dropped. */
export function TargetYearSelect({ value, onChange, label, years = defaultTargetYears() }: {
  value: string;
  onChange: (year: string) => void;
  label: string;
  years?: string[];
}) {
  const options = years.includes(value) ? years : [value, ...years];
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="h-10 w-[8.5rem] rounded-xl border-border/70 bg-background/90 text-sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>{option}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
