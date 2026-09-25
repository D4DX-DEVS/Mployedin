import { MapPin } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { AssignedRegion } from "@/lib/agents/assignedRegion";

/** "Tirur, Kerala, India" — the region with its parent chain. */
export function formatAssignedRegion(region: AssignedRegion): string {
  return region.parent ? `${region.name}, ${region.parent}` : region.name;
}

interface AssignedRegionBadgeProps {
  regions: readonly AssignedRegion[];
  className?: string;
}

/**
 * The region an admin assigned to an agent or super-agent, as one pill. One
 * region reads in full; several collapse to "Tirur +2" with the whole list in
 * the tooltip. No region is said out loud (amber) rather than hidden, since
 * an agent without one sees no regional work and should know to ask an admin.
 *
 * No "use client": it renders inside server headers (AgentSmartHeader) and
 * client settings pages alike.
 */
export function AssignedRegionBadge({ regions, className }: AssignedRegionBadgeProps) {
  const t = useTranslations("assignedRegion");
  const hasRegion = regions.length > 0;
  const full = regions.map(formatAssignedRegion).join(" · ");
  const text = !hasRegion
    ? t("none")
    : regions.length === 1
      ? formatAssignedRegion(regions[0])
      : t("more", { name: regions[0].name, count: regions.length - 1 });

  return (
    <span
      data-testid="assigned-region-badge"
      title={hasRegion ? full : t("noneHint")}
      className={cn(
        "inline-flex max-w-full shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 align-top text-[11px] font-semibold leading-4",
        hasRegion ? "bg-sky-500/10 text-sky-800" : "bg-amber-500/15 text-amber-800",
        className,
      )}
    >
      <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="sr-only">{t("label")}: </span>
      <span className="truncate">{text}</span>
    </span>
  );
}
