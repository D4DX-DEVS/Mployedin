"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SUPPORTED_CURRENCIES, type CurrencyInfo } from "@/lib/currency";

interface CurrencySelectorProps {
  value: string;
  onChange: (code: string) => void;
  /** Accessible name for the trigger. The visible "Display currency" label
   *  beside it is hidden on phones, which left an unnamed combobox reading
   *  only "AED". */
  ariaLabel: string;
}

/**
 * Compact currency picker – lets users switch the display currency
 * for prices shown on the subscription page.
 */
export function CurrencySelector({ value, onChange, ariaLabel }: CurrencySelectorProps) {
  const current = SUPPORTED_CURRENCIES.find((c) => c.code === value);

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={ariaLabel} className="h-11 w-[180px] text-xs sm:h-8">
        <SelectValue>
          {current
            ? current.symbol !== current.code
              ? `${current.symbol} ${current.code}`
              : current.code
            : value}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-60">
        {SUPPORTED_CURRENCIES.map((c: CurrencyInfo) => (
          <SelectItem key={c.code} value={c.code} className="text-xs">
            {c.symbol !== c.code ? `${c.symbol} ` : ""}{c.code} — {c.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
