"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { CalendarClock, ShieldCheck, Trophy, Users2 } from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import {
  SuperAgentDataTableShell,
  SuperAgentEmptyState,
  SuperAgentMetricsGrid,
  SuperAgentPageIntro,
  SuperAgentSection,
} from "@/components/features/super-agent/WorkspacePage";

interface Placement {
  _id: string;
  jobSeekerId?: { fullName?: string };
  jobId?: { title?: string };
  employerId?: { companyName?: string };
  status: string;
  salary?: number;
  currency?: string;
  startDate?: string;
  createdAt: string;
}

export default function SuperAgentPlacementsPage() {
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [loading, setLoading] = useState(true);
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal } = usePagination();

  const fetchPlacements = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    const res = await fetch(`/api/placements?${params}`);
    if (res.ok) {
      const data = await res.json();
      setPlacements(data.items ?? data.placements ?? []);
      updateTotal(data.total ?? data.totalCount ?? ((data.totalPages ?? 1) * limit));
    }
    setLoading(false);
  }, [page, limit, updateTotal]);

  useEffect(() => { fetchPlacements(); }, [fetchPlacements]);

  const upcomingStarts = useMemo(() => placements.filter((placement) => {
    if (!placement.startDate) return false;
    const start = new Date(placement.startDate).getTime();
    if (Number.isNaN(start)) return false;
    const now = Date.now();
    const twoWeeks = 14 * 24 * 60 * 60 * 1000;
    return start >= now && start <= now + twoWeeks;
  }).length, [placements]);

  const employerCount = useMemo(
    () => new Set(placements.map((placement) => placement.employerId?.companyName).filter(Boolean)).size,
    [placements]
  );

  const kpis = [
    {
      label: "Placements",
      value: placements.length,
      helper: "Visible placement records returned for the current page.",
      icon: <Trophy className="h-5 w-5" />,
      toneClassName: "workspace-tone-sky",
    },
    {
      label: "Upcoming Starts",
      value: upcomingStarts,
      helper: "Candidates scheduled to start within the next two weeks.",
      icon: <CalendarClock className="h-5 w-5" />,
      toneClassName: "workspace-tone-emerald",
    },
    {
      label: "Active Statuses",
      value: placements.filter((placement) => placement.status === "active" || placement.status === "placed").length,
      helper: "Visible placements already marked active or fully placed.",
      icon: <ShieldCheck className="h-5 w-5" />,
      toneClassName: "workspace-tone-indigo",
    },
    {
      label: "Employers",
      value: employerCount,
      helper: "Distinct employer accounts represented in the current placement list.",
      icon: <Users2 className="h-5 w-5" />,
      toneClassName: "workspace-tone-amber",
    },
  ];

  return (
    <div className="page-container space-y-6">
      <SuperAgentPageIntro
        title="Placements"
        description="Track successful candidate placements made by your team, monitor start timing, and keep employer delivery visible from one polished review surface."
        summaryTitle="Placement flow"
        summaryDescription="This page keeps the existing placements endpoint and pagination logic intact while moving the UI onto the modern workspace pattern."
      />

      <SuperAgentMetricsGrid items={kpis} />

      <SuperAgentSection
        eyebrow="Placements"
        title="Review successful hiring outcomes"
        description="Use the same data and status badges, now presented in the updated super-agent table shell."
      >
        <SuperAgentDataTableShell>
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border/60 bg-secondary/65 hover:bg-secondary/65">
                <TableHead className="py-4 text-muted-foreground/80">Candidate</TableHead>
                <TableHead className="py-4 text-muted-foreground/80">Job</TableHead>
                <TableHead className="py-4 text-muted-foreground/80">Employer</TableHead>
                <TableHead className="py-4 text-muted-foreground/80">Status</TableHead>
                <TableHead className="py-4 text-muted-foreground/80">Start Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="border-border/50">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <TableCell key={j} className="py-4"><div className="h-4 w-3/4 animate-pulse rounded bg-muted/75" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : placements.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="p-0">
                    <SuperAgentEmptyState
                      icon={<Trophy className="h-7 w-7" />}
                      title="No placements yet"
                      description="Placements will appear here once your team closes successful hires."
                    />
                  </TableCell>
                </TableRow>
              ) : placements.map((p) => (
                <TableRow key={p._id} className="border-border/50 hover:bg-accent/25">
                  <TableCell className="py-4 font-medium text-foreground">{p.jobSeekerId?.fullName ?? "—"}</TableCell>
                  <TableCell className="py-4 text-foreground/85">{p.jobId?.title ?? "—"}</TableCell>
                  <TableCell className="py-4 text-muted-foreground">{p.employerId?.companyName ?? "—"}</TableCell>
                  <TableCell className="py-4"><StatusBadge status={p.status} /></TableCell>
                  <TableCell className="py-4 text-muted-foreground">{p.startDate ? new Date(p.startDate).toLocaleDateString() : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SuperAgentDataTableShell>

        <div className="mt-4">
          <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />
        </div>
      </SuperAgentSection>
    </div>
  );
}
