"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { PaginationControls } from "@/components/shared/PaginationControls";

import { usePagination } from "@/hooks/usePagination";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Sparkles, Loader2, Star, Users, MapPin, Briefcase } from "lucide-react";

interface Candidate {
  _id: string;
  userId?: { name: string; email: string };
  currentLocation?: string;
  experience?: { jobTitle: string; company: string; isCurrent: boolean }[];
  skills?: string[];
  availabilityStatus?: string;
  profileCompleteness?: number;
  matchScore?: number;
  matchBreakdown?: {
    skills: number;
    experience: number;
    location: number;
    language: number;
  };
  matchSummary?: string;
  strengths?: string[];
  gaps?: string[];
}

interface Job { _id: string; title: string; }

export default function EmployerCandidatesPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [matching, setMatching] = useState(false);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"table" | "cards">("table");
  const pagination = usePagination();

  const loadJobs = useCallback(async () => {
    const res = await fetch("/api/jobs?limit=50&status=published");
    if (res.ok) {
      const data = await res.json();
      setJobs(data.jobs ?? []);
    }
  }, []);

  const loadCandidates = useCallback(async () => {
    setLoading(true);
    try {
      const params = pagination.paginationParams();
      if (search) params.set("search", search);
      const res = await fetch(`/api/job-seekers?${params}`);
      if (res.ok) {
        const data = await res.json();
        setCandidates(data.items ?? []);
        pagination.updateTotal(data.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [search, pagination.page, pagination.limit]);

  useEffect(() => { loadJobs(); }, [loadJobs]);
  useEffect(() => {
    const t = setTimeout(loadCandidates, 300);
    return () => clearTimeout(t);
  }, [loadCandidates]);

  useEffect(() => { pagination.resetPage(); }, [search]);

  const runAIMatch = async () => {
    if (!selectedJob || candidates.length === 0) return;
    setMatching(true);
    try {
      const top = candidates.slice(0, 10);
      const updated = await Promise.all(
        top.map(async (c) => {
          try {
            const res = await fetch("/api/ai/match", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ jobId: selectedJob, jobSeekerId: c._id }),
            });
            if (res.ok) {
              const data = await res.json();
              return {
                ...c,
                matchScore: data.score,
                matchBreakdown: data.breakdown,
                matchSummary: data.summary,
                strengths: data.strengths,
                gaps: data.gaps,
              };
            }
          } catch { /* skip */ }
          return c;
        })
      );
      setCandidates((prev) => {
        const updMap = Object.fromEntries(updated.map((u) => [u._id, u]));
        return prev
          .map((c) => updMap[c._id] ?? c)
          .sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
      });
    } finally {
      setMatching(false);
    }
  };

  const scoreColor = (score?: number) => {
    if (score == null) return "text-muted-foreground";
    if (score >= 80) return "text-emerald-600";
    if (score >= 60) return "text-amber-600";
    return "text-red-500";
  };

  const availabilityLabel = (s?: string) => {
    switch (s) {
      case "immediately": return "Immediate";
      case "within_month": return "Within 1 month";
      case "within_3_months": return "Within 3 months";
      case "not_available": return "Not available";
      default: return "—";
    }
  };

  const currentRole = (c: Candidate) =>
    c.experience?.find((e) => e.isCurrent)?.jobTitle ?? null;

  return (
    <div className="page-container">
      <PageHeader
        title="AI Candidate Matching"
        description={`${pagination.total} candidates in database`}
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant={view === "table" ? "default" : "outline"} onClick={() => setView("table")}>
              Table
            </Button>
            <Button size="sm" variant={view === "cards" ? "default" : "outline"} onClick={() => setView("cards")}>
              Cards
            </Button>
          </div>
        }
      />

      {/* Filters */}
      <div className="card-base p-4 flex flex-col sm:flex-row gap-3">
        <Select value={selectedJob || "none"} onValueChange={(v) => setSelectedJob(v === "none" ? "" : v)}>
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Select a job to match against…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No job selected</SelectItem>
            {jobs.map((j) => (
              <SelectItem key={j._id} value={j._id}>{j.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or skill…"
            className="pl-9 pr-4"
          />
        </div>
        <Button
          onClick={runAIMatch}
          disabled={!selectedJob || matching || candidates.length === 0}
          className="h-10 whitespace-nowrap"
        >
          {matching ? <Loader2 className="h-4 w-4 animate-spin me-2" /> : <Sparkles className="h-4 w-4 me-2" />}
          {matching ? "Matching…" : "Run AI Match"}
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card-base h-16 animate-pulse" />
          ))}
        </div>
      ) : candidates.length === 0 ? (
        <div className="card-base flex flex-col items-center justify-center py-20 text-center">
          <Users className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <h3 className="font-semibold text-lg">No candidates found</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {search ? "Try a different search term" : "No job seeker profiles exist yet"}
          </p>
        </div>
      ) : view === "table" ? (
        /* ─── Table View ─── */
        <div className="card-base overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Candidate</TableHead>
                <TableHead>Current Role</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Skills</TableHead>
                <TableHead>Availability</TableHead>
                {candidates.some((c) => c.matchScore != null) && (
                  <TableHead className="text-right">AI Score</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {candidates.map((c) => (
                <TableRow key={c._id} className="group">
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm">{c.userId?.name ?? "Unknown"}</p>
                      <p className="text-xs text-muted-foreground">{c.userId?.email}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">{currentRole(c) ?? <span className="text-muted-foreground">—</span>}</span>
                  </TableCell>
                  <TableCell>
                    {c.currentLocation ? (
                      <span className="text-sm flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-muted-foreground" />
                        {c.currentLocation}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                      {c.skills?.slice(0, 3).map((s) => (
                        <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                      ))}
                      {(c.skills?.length ?? 0) > 3 && (
                        <Badge variant="outline" className="text-xs">+{c.skills!.length - 3}</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={c.availabilityStatus === "immediately" ? "default" : c.availabilityStatus === "not_available" ? "destructive" : "secondary"} className="text-xs">
                      {availabilityLabel(c.availabilityStatus)}
                    </Badge>
                  </TableCell>
                  {candidates.some((cc) => cc.matchScore != null) && (
                    <TableCell className="text-right">
                      {c.matchScore != null ? (
                        <span className={`text-lg font-bold ${scoreColor(c.matchScore)}`}>{c.matchScore}%</span>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        /* ─── Card View ─── */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {candidates.map((c) => (
            <div key={c._id} className="card-base p-5 space-y-3 hover:shadow-md transition-all">
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{c.userId?.name ?? "Unknown"}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {currentRole(c) ?? "Job Seeker"}
                    {c.experience?.find((e) => e.isCurrent)?.company
                      ? ` at ${c.experience.find((e) => e.isCurrent)!.company}`
                      : ""}
                  </p>
                </div>
                {c.matchScore != null && (
                  <div className="text-right flex-shrink-0">
                    <div className={`text-xl font-bold ${scoreColor(c.matchScore)}`}>{c.matchScore}%</div>
                    <p className="text-[10px] text-muted-foreground">match</p>
                  </div>
                )}
              </div>

              {/* Meta */}
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {c.currentLocation && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {c.currentLocation}
                  </span>
                )}
                {currentRole(c) && (
                  <span className="flex items-center gap-1">
                    <Briefcase className="h-3 w-3" /> {c.experience?.length ?? 0} roles
                  </span>
                )}
              </div>

              {/* Skills */}
              {c.skills && c.skills.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {c.skills.slice(0, 5).map((s) => (
                    <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                  ))}
                  {c.skills.length > 5 && (
                    <Badge variant="outline" className="text-xs">+{c.skills.length - 5}</Badge>
                  )}
                </div>
              )}

              {/* AI Match Breakdown */}
              {c.matchBreakdown && (
                <div className="space-y-2 pt-2 border-t">
                  {Object.entries(c.matchBreakdown).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-2 text-xs">
                      <span className="capitalize text-muted-foreground w-20">{k}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full ${v >= 80 ? "bg-emerald-500" : v >= 60 ? "bg-amber-500" : "bg-red-400"}`}
                          style={{ width: `${v}%` }}
                        />
                      </div>
                      <span className="font-medium w-8 text-right">{v}%</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Availability */}
              <div className="flex items-center justify-between pt-1">
                <Badge variant={c.availabilityStatus === "immediately" ? "default" : c.availabilityStatus === "not_available" ? "destructive" : "secondary"} className="text-xs">
                  {availabilityLabel(c.availabilityStatus)}
                </Badge>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
                  <Star className="h-3 w-3 text-amber-500" /> Shortlist
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <PaginationControls
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        limit={pagination.limit}
        onPageChange={pagination.setPage}
        onLimitChange={pagination.setLimit}
      />
    </div>
  );
}
