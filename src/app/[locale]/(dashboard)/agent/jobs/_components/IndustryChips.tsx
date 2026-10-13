"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { formatCount } from "@/lib/ui/intlFormat";

export interface IndustryFacet {
  value: string;
  label: string;
  /** Live portal jobs at employers in this industry. */
  count: number;
}

interface IndustryChipsProps {
  industries: IndustryFacet[];
  /** The selected industry value, "" for all. */
  value: string;
  onChange: (value: string) => void;
}

/**
 * Browse jobs by industry: one chip per industry with its open-job count,
 * busiest first. Scrolls sideways on phones instead of wrapping into rows.
 */
export function IndustryChips({ industries, value, onChange }: IndustryChipsProps) {
  const t = useTranslations("agentJobs.browse");
  const sorted = [...industries].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const selectedKey = value.trim().toLowerCase().replace(/[_\s]+/g, " ");
  const isSelected = (industry: IndustryFacet) =>
    industry.value.trim().toLowerCase().replace(/[_\s]+/g, " ") === selectedKey;

  const chip = (active: boolean) =>
    cn(
      "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors sm:min-h-8",
      active
        ? "border-primary/40 bg-primary/10 text-primary"
        : "border-border bg-card text-foreground/80 hover:border-primary/30 hover:text-primary",
    );

  return (
    <nav aria-label={t("industriesLabel")} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible">
      <button type="button" aria-pressed={!value} onClick={() => onChange("")} className={chip(!value)}>
        {t("allIndustries")}
      </button>
      {sorted.map((industry) => {
        const active = isSelected(industry);
        return (
          <button
            key={industry.value}
            type="button"
            aria-pressed={active}
            // Tapping the selected industry again clears it.
            onClick={() => onChange(active ? "" : industry.value)}
            className={chip(active)}
          >
            <span dir="auto">{industry.label}</span>
            <span className={cn("rounded-full px-1.5 tabular-nums", active ? "bg-primary/15" : "bg-muted text-muted-foreground")}>
              {formatCount(industry.count)}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
