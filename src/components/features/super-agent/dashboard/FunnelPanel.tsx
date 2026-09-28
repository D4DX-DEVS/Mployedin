import { Filter } from "lucide-react";
import { BarList, Panel, type BarListRow } from "@/components/shared/DashboardKit";
import type { SuperAgentFunnel } from "@/lib/superAgent/dashboardData";
import { formatCount } from "@/lib/ui/intlFormat";
import type { SuperAgentHref, SuperAgentTranslator } from "./types";

interface Props {
  funnel: SuperAgentFunnel;
  href: SuperAgentHref;
  t: SuperAgentTranslator;
}

/**
 * All-time volume per stage, plus the three ratios that actually mean
 * something. The stages count different record types, so a step-over-step
 * percentage would read as a conversion rate and is not one; the ratios say
 * what they divide instead.
 */
export function FunnelPanel({ funnel, href, t }: Props) {
  const rows: BarListRow[] = [
    { key: "leads", label: t("funnel.leads"), value: funnel.leads, valueLabel: formatCount(funnel.leads), href: href("/leads") },
    { key: "employers", label: t("funnel.employers"), value: funnel.employers, valueLabel: formatCount(funnel.employers), href: href("/employers") },
    { key: "jobs", label: t("funnel.jobs"), value: funnel.jobs, valueLabel: formatCount(funnel.jobs), href: href("/jobs") },
    { key: "applications", label: t("funnel.applications"), value: funnel.applications, valueLabel: formatCount(funnel.applications), href: href("/applications") },
    { key: "placements", label: t("funnel.placements"), value: funnel.placements, valueLabel: formatCount(funnel.placements), href: href("/placements") },
  ];
  const ratio = (num: number, den: number, format: (v: number) => string) => (den > 0 ? format(num / den) : "—");
  const ratios = [
    {
      key: "jobsPerEmployer",
      label: t("funnelPanel.jobsPerEmployer"),
      value: ratio(funnel.jobs, funnel.employers, (v) => `${v.toFixed(1)}×`),
      basis: t("funnelPanel.jobsPerEmployerBasis", { jobs: funnel.jobs, employers: funnel.employers }),
    },
    {
      key: "applicationsPerJob",
      label: t("funnelPanel.applicationsPerJob"),
      value: ratio(funnel.applications, funnel.jobs, (v) => v.toFixed(2)),
      basis: t("funnelPanel.applicationsPerJobBasis", { applications: funnel.applications, jobs: funnel.jobs }),
    },
    {
      key: "placementRate",
      label: t("funnel.placementRate"),
      value: ratio(funnel.placements, funnel.applications, (v) => `${Math.round(v * 100)}%`),
      basis: t("funnelPanel.placementRateBasis", { placements: funnel.placements, applications: funnel.applications }),
    },
  ];
  return (
    <Panel
      id="super-agent-funnel"
      icon={Filter}
      title={t("funnelPanel.title")}
      subtitle={t("funnelPanel.shortDescription")}
      aside={<span className="rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">{t("funnelPanel.period")}</span>}
      bodyClassName="justify-between gap-4"
    >
      <BarList rows={rows} tone="ramp" />
      <dl className="grid grid-cols-3 gap-2 border-t border-border/60 pt-3">
        {ratios.map((r) => (
          <div key={r.key} className="min-w-0">
            <dt className="truncate text-[11px] font-medium text-muted-foreground">{r.label}</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums leading-6 text-foreground">{r.value}</dd>
            <dd className="truncate text-[11px] text-muted-foreground">{r.basis}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}
