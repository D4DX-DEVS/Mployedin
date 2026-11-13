"use client";

import { useTranslations } from "next-intl";
import { OverflowTabs, type OverflowTabItem } from "@/components/shared/OverflowTabs";
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
 * Browse jobs by industry: chips that don't fit sit under More.
 * The row never scrolls sideways.
 */
export function IndustryChips({ industries, value, onChange }: IndustryChipsProps) {
  const t = useTranslations("agentJobs.browse");
  const sorted = [...industries].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  // Build items for OverflowTabs: each industry shows count in the label
  const items: OverflowTabItem<string>[] = [
    { key: "", label: t("allIndustries") },
    ...sorted.map((industry) => ({
      key: industry.value,
      label: `${industry.label} (${formatCount(industry.count)})`,
    })),
  ];

  return (
    <OverflowTabs
      items={items}
      value={value}
      onChange={onChange}
      ariaLabel={t("industriesLabel")}
      className="px-0"
    />
  );
}
