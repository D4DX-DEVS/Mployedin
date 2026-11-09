import type { GapRow } from "@/components/features/admin/market-gaps/useMarketGaps";

/** The one-sentence suggestion for a row, in the admin's language. */
export function gapSentence(
  t: (key: string, values?: Record<string, string | number>) => string,
  g: Pick<GapRow, "kind" | "role" | "areaName" | "seekers" | "jobs">,
): string {
  return t(`text.${g.kind}`, { role: g.role, area: g.areaName || t("areaNotSet"), seekers: g.seekers, jobs: g.jobs });
}
