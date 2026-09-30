"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { Minus, Plus, type LucideIcon } from "lucide-react";
import { TEXT_SCALES, type TextScale } from "@/lib/a11y/preferences";
import { cn } from "@/lib/utils";

interface TextSizeControlProps {
  value: TextScale;
  onChange: (value: TextScale) => void;
}

export function TextSizeControl({ value, onChange }: TextSizeControlProps) {
  const t = useTranslations("a11y");
  const headingId = useId();
  const index = TEXT_SCALES.indexOf(value);
  const smaller = index > 0 ? TEXT_SCALES[index - 1] : null;
  const larger = index < TEXT_SCALES.length - 1 ? TEXT_SCALES[index + 1] : null;

  // aria-disabled, not disabled: a button that disables itself under the
  // pointer or keyboard would drop focus onto <body> at the end of the range.
  const steps: { sign?: LucideIcon; size: string; label: string; target: TextScale | null; pressed?: boolean }[] = [
    { sign: Minus, size: "text-sm", label: t("textSmaller"), target: smaller },
    { size: "text-base", label: t("textDefault"), target: 100, pressed: value === 100 },
    { sign: Plus, size: "text-lg", label: t("textLarger"), target: larger },
  ];

  return (
    <section aria-labelledby={headingId}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 id={headingId} className="text-sm font-semibold text-foreground">
          {t("textSize")}
        </h3>
        <p aria-live="polite" className="text-xs font-medium tabular-nums text-muted-foreground">
          <span className="sr-only">{t("textSize")} </span>
          {t("textSizeValue", { percent: value })}
        </p>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">{t("textSizeHint")}</p>
      <div role="group" aria-labelledby={headingId} className="mt-3 grid grid-cols-3 gap-2">
        {steps.map(({ sign: Sign, size, label, target, pressed }) => (
          <button
            key={label}
            type="button"
            aria-label={label}
            aria-pressed={pressed}
            aria-disabled={target === null || undefined}
            onClick={() => {
              if (target !== null && target !== value) onChange(target);
            }}
            className={cn(
              "flex min-h-11 items-center justify-center gap-0.5 rounded-lg border font-semibold text-foreground transition-colors",
              size,
              pressed
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background hover:bg-muted",
              "aria-disabled:cursor-not-allowed aria-disabled:opacity-50",
            )}
          >
            {/* A−, A, A+ in both languages; the aria-label says what each does. */}
            <span aria-hidden="true">A</span>
            {Sign && <Sign aria-hidden="true" className="size-3.5" strokeWidth={2.5} />}
          </button>
        ))}
      </div>
    </section>
  );
}
