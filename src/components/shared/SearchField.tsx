"use client";

import { useId, type InputHTMLAttributes } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface SearchFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "className"> {
  value: string;
  onValueChange: (value: string) => void;
  /** Visible label above the box. Defaults to "Search". */
  label?: string;
  /** Wrapper: sizing and placement in the parent row. */
  className?: string;
  /** The input itself: height, radius, background. The icon padding is built in. */
  inputClassName?: string;
}

/**
 * A page's search box with a visible label (WCAG 3.3.2 / 1.3.1). The
 * placeholder is a hint ("Name, email or phone"), not the label: it vanished on
 * the first keystroke and was cut mid-word on phones. Rows that hold this next
 * to selects or buttons should align items to the end so they sit level with
 * the box, not its label.
 */
export function SearchField({ value, onValueChange, label, className, inputClassName, id, ...inputProps }: SearchFieldProps) {
  const t = useTranslations("common");
  const autoId = useId();
  const inputId = id ?? autoId;

  return (
    <div className={cn("min-w-0", className)}>
      <label htmlFor={inputId} className="mb-1 block truncate text-xs font-medium text-muted-foreground">
        {label ?? t("search")}
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          {...inputProps}
          id={inputId}
          type="search"
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          className={cn("ps-9", inputClassName)}
        />
      </div>
    </div>
  );
}
