"use client";

import { useRef, type KeyboardEvent } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Choice<V extends string> {
  value: V;
  label: string;
  icon?: LucideIcon;
}

/**
 * A pick-one row of chips (contact method, follow-up type, lost reason) as a
 * real radio group: one tab stop, arrow keys move the choice, the selected
 * chip is announced as checked.
 */
export function ChoiceChips<V extends string>({
  choices,
  value,
  onChange,
  labelledBy,
  layout = "wrap",
  invalid,
}: {
  choices: readonly Choice<V>[];
  value: V | undefined;
  onChange: (value: V) => void;
  labelledBy: string;
  layout?: "wrap" | "list";
  invalid?: boolean;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = choices.findIndex((c) => c.value === value);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const forward = ["ArrowRight", "ArrowDown"].includes(event.key);
    const back = ["ArrowLeft", "ArrowUp"].includes(event.key);
    if (!forward && !back) return;
    event.preventDefault();
    // Arrow direction follows reading order: ArrowRight in Arabic goes back.
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
    const horizontal = event.key === "ArrowRight" || event.key === "ArrowLeft";
    const step = (forward ? 1 : -1) * (rtl && horizontal ? -1 : 1);
    const next = (index + step + choices.length) % choices.length;
    onChange(choices[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-invalid={invalid || undefined}
      className={cn(layout === "list" ? "grid gap-1.5" : "flex flex-wrap gap-1.5")}
    >
      {choices.map((choice, index) => {
        const checked = choice.value === value;
        const Icon = choice.icon;
        return (
          <button
            key={choice.value}
            ref={(node) => { refs.current[index] = node; }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked || (selectedIndex === -1 && index === 0) ? 0 : -1}
            onClick={() => onChange(choice.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              layout === "list" && "w-full justify-start",
              checked
                ? "border-primary bg-primary/10 font-semibold text-primary"
                : "border-border bg-background text-foreground/80 hover:border-foreground/30",
            )}
          >
            {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />}
            {choice.label}
          </button>
        );
      })}
    </div>
  );
}
