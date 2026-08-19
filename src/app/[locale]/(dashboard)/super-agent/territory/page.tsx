"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  SuperAgentPageIntro, SuperAgentMetricsGrid, SuperAgentSection, SuperAgentEmptyState,
} from "@/components/features/super-agent/WorkspacePage";
import { MapPin, Users, Globe, Building2, Briefcase, TrendingUp, UserCheck } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TerritoryRegion {
  _id: string;
  name: string;
  type: "country" | "state" | "city";
  agentCount: number;
  employerCount: number;
  jobCount: number;
  seekerCount: number;
}

interface TerritoryStats {
  totalRegions: number;
  totalAgents: number;
  totalEmployers: number;
  totalJobs: number;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function SuperAgentTerritoryPage() {
  const t = useTranslations("superAgentTerritory");
  const tc = useTranslations("common");
  const [regions, setRegions] = useState<TerritoryRegion[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<TerritoryStats>({ totalRegions: 0, totalAgents: 0, totalEmployers: 0, totalJobs: 0 });

  const fetchTerritory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/super-agent/territory");
      if (res.ok) {
        const data = await res.json();
        setRegions(data.regions ?? []);
        if (data.stats) setStats(data.stats);
      }
    } catch {
      toast.error(t("loadTerritoryError"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTerritory(); }, [fetchTerritory]);

  const metricsItems = [
    { label: t("metricsRegions"), value: stats.totalRegions, helper: t("metricsRegionsHelper"), icon: <Globe className="h-5 w-5" />, toneClassName: "workspace-tone-sky" },
    { label: t("metricsAgents"), value: stats.totalAgents, helper: t("metricsAgentsHelper"), icon: <Users className="h-5 w-5" />, toneClassName: "workspace-tone-emerald" },
    { label: t("metricsEmployers"), value: stats.totalEmployers, helper: t("metricsEmployersHelper"), icon: <Building2 className="h-5 w-5" />, toneClassName: "workspace-tone-violet" },
    { label: t("metricsActiveJobs"), value: stats.totalJobs, helper: t("metricsJobsHelper"), icon: <Briefcase className="h-5 w-5" />, toneClassName: "workspace-tone-amber" },
  ];

  /* Color scale based on agent density */
  const getHeatColor = (count: number) => {
    if (count >= 5) return "border-emerald-200 bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:border-emerald-800/50 dark:from-emerald-950/40 dark:to-emerald-900/20";
    if (count >= 3) return "border-sky-200 bg-gradient-to-br from-sky-50 to-sky-100/50 dark:border-sky-800/50 dark:from-sky-950/40 dark:to-sky-900/20";
    if (count >= 1) return "border-amber-200 bg-gradient-to-br from-amber-50 to-amber-100/50 dark:border-amber-800/50 dark:from-amber-950/40 dark:to-amber-900/20";
    return "border-red-200 bg-gradient-to-br from-red-50 to-red-100/30 dark:border-red-800/50 dark:from-red-950/40 dark:to-red-900/20";
  };

  const getHeatLabel = (count: number) => {
    if (count >= 5) return t("coverageHigh");
    if (count >= 3) return t("coverageGood");
    if (count >= 1) return t("coverageLow");
    return t("coverageNone");
  };

  const getHeatBadge = (count: number) => {
    if (count >= 5) return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300";
    if (count >= 3) return "bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300";
    if (count >= 1) return "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300";
    return "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300";
  };

  /* Compute coverage summary */
  const coverageSummary = {
    high: regions.filter((r) => r.agentCount >= 5).length,
    good: regions.filter((r) => r.agentCount >= 3 && r.agentCount < 5).length,
    low: regions.filter((r) => r.agentCount >= 1 && r.agentCount < 3).length,
    none: regions.filter((r) => r.agentCount === 0).length,
  };

  return (
    <div className="page-container">
      <SuperAgentPageIntro
        title={t("pageTitle")}
        description={t("pageDescription")}
        summaryTitle={t("summaryTitle")}
        summaryDescription={t("summaryDescription", { count: coverageSummary.high + coverageSummary.good, total: regions.length })}
      />

      <SuperAgentMetricsGrid items={metricsItems} />

      {/* Coverage Legend — inline bar style */}
      <div className="workspace-glass-panel rounded-2xl px-5 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("coverageDistribution")}</p>
          <div className="flex flex-nowrap items-center gap-2 overflow-x-auto scrollbar-none sm:flex-wrap sm:gap-4 sm:overflow-visible">
            {[
              { color: "bg-emerald-500", label: t("legendHigh"), count: coverageSummary.high },
              { color: "bg-sky-500", label: t("legendGood"), count: coverageSummary.good },
              { color: "bg-amber-500", label: t("legendLow"), count: coverageSummary.low },
              { color: "bg-red-400", label: t("legendNone"), count: coverageSummary.none },
            ].map((l) => (
              <div key={l.label} className="flex shrink-0 items-center gap-1 sm:gap-2">
                <div className={`h-2 w-2 shrink-0 rounded-full sm:h-2.5 sm:w-2.5 ${l.color}`} />
                <span className="whitespace-nowrap text-[10px] text-muted-foreground sm:text-xs">{l.label}</span>
                <span className="whitespace-nowrap rounded-md bg-muted px-1 py-0.5 text-[9px] font-semibold text-muted-foreground sm:px-1.5 sm:text-[10px]">{l.count}</span>
              </div>
            ))}
          </div>
        </div>
        {/* Visual bar */}
        {regions.length > 0 && (
          <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full">
            {coverageSummary.high > 0 && <div className="bg-emerald-500 transition-all" style={{ width: `${(coverageSummary.high / regions.length) * 100}%` }} />}
            {coverageSummary.good > 0 && <div className="bg-sky-500 transition-all" style={{ width: `${(coverageSummary.good / regions.length) * 100}%` }} />}
            {coverageSummary.low > 0 && <div className="bg-amber-500 transition-all" style={{ width: `${(coverageSummary.low / regions.length) * 100}%` }} />}
            {coverageSummary.none > 0 && <div className="bg-red-400 transition-all" style={{ width: `${(coverageSummary.none / regions.length) * 100}%` }} />}
          </div>
        )}
      </div>

      {/* Territory Grid */}
      <SuperAgentSection title={t("sectionTitle")} description={t("sectionDescription", { count: regions.length })}>
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded-2xl border border-border bg-muted/30 p-6">
                <div className="h-5 w-24 rounded bg-muted" />
                <div className="mt-3 h-3 w-16 rounded bg-muted" />
                <div className="mt-6 grid grid-cols-2 gap-3">
                  {Array.from({ length: 4 }).map((_, j) => (
                    <div key={j} className="h-10 rounded bg-muted/60" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : regions.length === 0 ? (
          <SuperAgentEmptyState icon={<MapPin className="h-10 w-10" />} title={t("emptyTitle")} description={t("emptyDescription")} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {regions.map((region) => (
              <div
                key={region._id}
                className={`group relative rounded-2xl border p-3 sm:p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${getHeatColor(region.agentCount)}`}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <MapPin className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{region.name}</p>
                      <p className="text-xs capitalize text-muted-foreground">{region.type}</p>
                    </div>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${getHeatBadge(region.agentCount)}`}>
                    {getHeatLabel(region.agentCount)}
                  </span>
                </div>

                {/* Divider */}
                <div className="my-4 h-px bg-border/60" />

                {/* Stats grid */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <div className="flex items-center gap-2.5">
                    <UserCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <div>
                      <p className="text-lg font-bold tabular-nums text-foreground">{region.agentCount}</p>
                      <p className="text-[10px] font-medium text-muted-foreground">{t("cardAgents")}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Building2 className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                    <div>
                      <p className="text-lg font-bold tabular-nums text-foreground">{region.employerCount}</p>
                      <p className="text-[10px] font-medium text-muted-foreground">{t("cardEmployers")}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Briefcase className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                    <div>
                      <p className="text-lg font-bold tabular-nums text-foreground">{region.jobCount}</p>
                      <p className="text-[10px] font-medium text-muted-foreground">{t("cardJobs")}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <TrendingUp className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    <div>
                      <p className="text-lg font-bold tabular-nums text-foreground">{region.seekerCount}</p>
                      <p className="text-[10px] font-medium text-muted-foreground">{t("cardCandidates")}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SuperAgentSection>
    </div>
  );
}
