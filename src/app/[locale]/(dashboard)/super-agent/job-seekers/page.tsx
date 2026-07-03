"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { TableToolbar } from "@/components/shared/TableToolbar";
import { usePagination } from "@/hooks/usePagination";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  SuperAgentPageIntro, SuperAgentMetricsGrid, SuperAgentSection,
} from "@/components/features/super-agent/WorkspacePage";
import {
  RotateCcw, Users, Briefcase, GraduationCap,
  Star, Eye, Mail, Phone, Globe, MapPin,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface JobSeekerItem {
  _id: string;
  fullName: string;
  email: string;
  phone?: string;
  country?: string;
  city?: string;
  currentJobTitle?: string;
  experienceYears?: number;
  profileCompletion?: number;
  skills?: string[];
  createdAt: string;
  isActive?: boolean;
}

interface Filters {
  search: string;
  country: string;
  experienceMin: string;
  availability: string;
}

const INITIAL_FILTERS: Filters = { search: "", country: "all", experienceMin: "all", availability: "all" };

const EXPERIENCE_OPTIONS = [
  { value: "all", label: "All experience" },
  { value: "0", label: "Fresh (0 yrs)" },
  { value: "1", label: "1+ years" },
  { value: "3", label: "3+ years" },
  { value: "5", label: "5+ years" },
  { value: "10", label: "10+ years" },
];

const AVAILABILITY_OPTIONS = [
  { value: "all", label: "All availability" },
  { value: "immediate", label: "Available immediately" },
  { value: "notice_period", label: "Has notice period" },
  { value: "unavailable", label: "Not available" },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function SuperAgentJobSeekersPage() {
  const [seekers, setSeekers] = useState<JobSeekerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [countryOptions, setCountryOptions] = useState<{ value: string; label: string }[]>([{ value: "all", label: "All countries" }]);
  const [totalStats, setTotalStats] = useState({ total: 0, active: 0, avgCompletion: 0, withExperience: 0 });
  const pagination = usePagination();

  const handleClearFilters = () => {
    setFilters(INITIAL_FILTERS);
    pagination.resetPage();
  };

  const fetchSeekers = useCallback(async () => {
    setLoading(true);
    try {
      const params = pagination.paginationParams();
      if (filters.search) params.set("search", filters.search);
      if (filters.country !== "all") params.set("country", filters.country);
      if (filters.experienceMin !== "all") params.set("experienceMin", filters.experienceMin);
      if (filters.availability !== "all") params.set("availability", filters.availability);

      const res = await fetch(`/api/super-agent/job-seekers?${params}`);
      if (res.ok) {
        const data = await res.json();
        setSeekers(data.items ?? []);
        pagination.updateTotal(data.total ?? 0);
        if (data.stats) setTotalStats(data.stats);
        if (data.countries) {
          setCountryOptions([
            { value: "all", label: "All countries" },
            ...data.countries.map((c: string) => ({ value: c, label: c })),
          ]);
        }
      }
    } catch {
      toast.error("Failed to load job seekers");
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.page, pagination.limit]);

  useEffect(() => { fetchSeekers(); }, [fetchSeekers]);

  const updateFilter = (key: keyof Filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    pagination.resetPage();
  };

  const metricsItems = [
    { label: "Total Candidates", value: totalStats.total, helper: "In your region", icon: <Users className="h-5 w-5" />, toneClassName: "workspace-tone-sky" },
    { label: "Active Profiles", value: totalStats.active, helper: "Currently seeking", icon: <Star className="h-5 w-5" />, toneClassName: "workspace-tone-emerald" },
    { label: "Avg Completion", value: `${totalStats.avgCompletion}%`, helper: "Profile completeness", icon: <GraduationCap className="h-5 w-5" />, toneClassName: "workspace-tone-violet" },
    { label: "Experienced", value: totalStats.withExperience, helper: "3+ years exp", icon: <Briefcase className="h-5 w-5" />, toneClassName: "workspace-tone-amber" },
  ];

  return (
    <div className="page-container space-y-6">
      <SuperAgentPageIntro
        title="Job Seekers"
        description="Browse candidates in your region. This is a read-only directory of job seekers linked to your agents."
      />

      <SuperAgentMetricsGrid items={metricsItems} />

      <TableToolbar
        title="Browse regional candidates"
        description="Search by name, email, or skills. Filter by country, experience level, and availability."
        search={filters.search}
        onSearchChange={(v) => updateFilter("search", v)}
        searchPlaceholder="Search by name, email, or skills..."
        hasActiveFilters={filters.country !== "all" || filters.experienceMin !== "all" || filters.availability !== "all"}
        actions={
          (filters.search || filters.country !== "all" || filters.experienceMin !== "all" || filters.availability !== "all") ? (
            <button
              type="button"
              onClick={handleClearFilters}
              className="flex h-9 items-center gap-2 rounded-lg border border-border/70 bg-card px-3 text-sm text-muted-foreground hover:bg-secondary/80 transition-all"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
          ) : undefined
        }
        filterContent={
          <div className="flex flex-wrap items-center gap-3">
            <SearchableSelect
              options={countryOptions}
              value={filters.country}
              onValueChange={(v) => updateFilter("country", v)}
              placeholder="All countries"
              className="h-11 w-[180px] rounded-xl border-border bg-card"
            />
            <SearchableSelect
              options={EXPERIENCE_OPTIONS}
              value={filters.experienceMin}
              onValueChange={(v) => updateFilter("experienceMin", v)}
              placeholder="All experience"
              className="h-11 w-[180px] rounded-xl border-border bg-card"
            />
            <SearchableSelect
              options={AVAILABILITY_OPTIONS}
              value={filters.availability}
              onValueChange={(v) => updateFilter("availability", v)}
              placeholder="All availability"
              className="h-11 w-[180px] rounded-xl border-border bg-card"
            />
          </div>
        }
      />

      <SuperAgentSection
        eyebrow="Directory"
        title="Candidates"
      >
        <div className="overflow-x-auto rounded-3xl border border-border/60">
          <Table>
            <TableHeader>
              <TableRow className="bg-background/60 hover:bg-background/60">
                <TableHead className="min-w-[180px]">Name</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Current Role</TableHead>
                <TableHead>Experience</TableHead>
                <TableHead>Profile</TableHead>
                <TableHead>Skills</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}><div className="h-4 w-3/4 animate-pulse rounded bg-muted/50" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : seekers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-sky-50 text-sky-600">
                        <Users className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="text-base font-semibold text-foreground">No job seekers found</p>
                        <p className="mt-1 text-sm text-muted-foreground">Try adjusting your filters</p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : seekers.map((s) => (
                <TableRow key={s._id} className="bg-transparent">
                  <TableCell>
                    <p className="font-medium text-foreground">{s.fullName}</p>
                    <p className="text-xs text-muted-foreground">{s.email}</p>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" />
                      {[s.city, s.country].filter(Boolean).join(", ") || "—"}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">{s.currentJobTitle || "—"}</TableCell>
                  <TableCell className="text-sm">{s.experienceYears != null ? `${s.experienceYears} yrs` : "—"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-16 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${s.profileCompletion ?? 0}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">{s.profileCompletion ?? 0}%</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(s.skills ?? []).slice(0, 3).map((sk) => (
                        <span key={sk} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{sk}</span>
                      ))}
                      {(s.skills?.length ?? 0) > 3 && (
                        <span className="text-[10px] text-muted-foreground">+{(s.skills?.length ?? 0) - 3}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(s.createdAt).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="mt-4">
          <PaginationControls
            page={pagination.page}
            totalPages={pagination.totalPages}
            limit={pagination.limit}
            total={pagination.total}
            onPageChange={pagination.setPage}
            onLimitChange={pagination.setLimit}
          />
        </div>
      </SuperAgentSection>
    </div>
  );
}
