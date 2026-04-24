"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  SuperAgentPageIntro, SuperAgentMetricsGrid, SuperAgentSection, SuperAgentEmptyState,
} from "@/components/features/super-agent/WorkspacePage";
import { MapPin, Users, Globe, Building2, Briefcase } from "lucide-react";

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
      toast.error("Failed to load territory data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTerritory(); }, [fetchTerritory]);

  const metricsItems = [
    { label: "Regions", value: stats.totalRegions, helper: "Assigned territories", icon: <Globe className="h-5 w-5" />, toneClassName: "workspace-tone-sky" },
    { label: "Agents", value: stats.totalAgents, helper: "Across all regions", icon: <Users className="h-5 w-5" />, toneClassName: "workspace-tone-emerald" },
    { label: "Employers", value: stats.totalEmployers, helper: "In your territory", icon: <Building2 className="h-5 w-5" />, toneClassName: "workspace-tone-violet" },
    { label: "Active Jobs", value: stats.totalJobs, helper: "Open positions", icon: <Briefcase className="h-5 w-5" />, toneClassName: "workspace-tone-amber" },
  ];

  /* Color scale based on agent density */
  const getHeatColor = (count: number) => {
    if (count >= 5) return "bg-emerald-500/20 border-emerald-500/40 dark:bg-emerald-500/10";
    if (count >= 3) return "bg-sky-500/20 border-sky-500/40 dark:bg-sky-500/10";
    if (count >= 1) return "bg-amber-500/20 border-amber-500/40 dark:bg-amber-500/10";
    return "bg-red-500/10 border-red-500/30 dark:bg-red-500/5";
  };

  const getHeatLabel = (count: number) => {
    if (count >= 5) return "High Coverage";
    if (count >= 3) return "Good Coverage";
    if (count >= 1) return "Low Coverage";
    return "No Coverage";
  };

  return (
    <div className="space-y-6">
      <SuperAgentPageIntro
        title="Territory Map"
        description="Visualize your assigned territories with agent coverage, employer density, and job distribution across regions."
      />

      <SuperAgentMetricsGrid items={metricsItems} />

      {/* Coverage Legend */}
      <SuperAgentSection title="Coverage Legend">
        <div className="flex flex-wrap gap-3">
          {[
            { color: "bg-emerald-500", label: "High (5+ agents)" },
            { color: "bg-sky-500", label: "Good (3-4 agents)" },
            { color: "bg-amber-500", label: "Low (1-2 agents)" },
            { color: "bg-red-500", label: "No Coverage (0)" },
          ].map((l) => (
            <div key={l.label} className="flex items-center gap-2">
              <div className={`h-3 w-3 rounded-full ${l.color}`} />
              <span className="text-xs text-muted-foreground">{l.label}</span>
            </div>
          ))}
        </div>
      </SuperAgentSection>

      {/* Territory Grid */}
      <SuperAgentSection title="Territory Overview" description={`${regions.length} regions assigned`}>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : regions.length === 0 ? (
          <SuperAgentEmptyState icon={<MapPin className="h-10 w-10" />} title="No territories assigned" description="Contact admin to assign territories to your account" />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {regions.map((region) => (
              <div
                key={region._id}
                className={`rounded-2xl border-2 p-5 transition-all hover:shadow-md ${getHeatColor(region.agentCount)}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium text-foreground">{region.name}</p>
                      <p className="text-xs capitalize text-muted-foreground">{region.type}</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    {getHeatLabel(region.agentCount)}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2">
                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    <div>
                      <p className="text-lg font-semibold text-foreground">{region.agentCount}</p>
                      <p className="text-[10px] text-muted-foreground">Agents</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <div>
                      <p className="text-lg font-semibold text-foreground">{region.employerCount}</p>
                      <p className="text-[10px] text-muted-foreground">Employers</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                    <div>
                      <p className="text-lg font-semibold text-foreground">{region.jobCount}</p>
                      <p className="text-[10px] text-muted-foreground">Jobs</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    <div>
                      <p className="text-lg font-semibold text-foreground">{region.seekerCount}</p>
                      <p className="text-[10px] text-muted-foreground">Candidates</p>
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
