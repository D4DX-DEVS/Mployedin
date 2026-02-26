"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Search, Sparkles, Loader2, Star } from "lucide-react";

interface Candidate {
  _id: string;
  name: string;
  email: string;
  title?: string;
  location?: string;
  skills?: string[];
  matchScore?: number;
  matchBreakdown?: {
    skills: number;
    experience: number;
    location: number;
    language: number;
  };
}

interface Job { _id: string; title: string; }

export default function EmployerCandidatesPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [matching, setMatching] = useState(false);
  const [search, setSearch] = useState("");

  const loadJobs = useCallback(async () => {
    const res = await fetch("/api/jobs?limit=20&status=published");
    if (res.ok) {
      const data = await res.json();
      setJobs(data.jobs ?? []);
    }
  }, []);

  const loadCandidates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/job-seekers?search=${encodeURIComponent(search)}&limit=20`);
      if (res.ok) {
        const data = await res.json();
        setCandidates(data.jobSeekers ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { loadJobs(); }, [loadJobs]);
  useEffect(() => {
    const t = setTimeout(loadCandidates, 300);
    return () => clearTimeout(t);
  }, [loadCandidates]);

  const runAIMatch = async () => {
    if (!selectedJob || candidates.length === 0) return;
    setMatching(true);
    // Match top 10 candidates
    const top = candidates.slice(0, 10);
    const updated = await Promise.all(
      top.map(async (c) => {
        try {
          const res = await fetch("/api/ai/match", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jobId: selectedJob, candidateId: c._id }),
          });
          if (res.ok) {
            const data = await res.json();
            return { ...c, matchScore: data.score, matchBreakdown: data.breakdown };
          }
        } catch { /* skip */ }
        return c;
      })
    );
    setCandidates((prev) => {
      const updMap = Object.fromEntries(updated.map((u) => [u._id, u]));
      return prev.map((c) => updMap[c._id] ?? c).sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
    });
    setMatching(false);
  };

  const scoreColor = (score?: number) => {
    if (!score) return "text-muted-foreground";
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-amber-600";
    return "text-red-500";
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <PageHeader
        title="AI Candidate Matching"
        description="Find the best-fit candidates for your open positions using AI"
      />

      {/* Controls */}
      <div className="card-base flex flex-col sm:flex-row gap-3">
        <select
          value={selectedJob}
          onChange={(e) => setSelectedJob(e.target.value)}
          className="flex-1 h-10 rounded-lg border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          <option value="">Select a job to match against…</option>
          {jobs.map((j) => <option key={j._id} value={j._id}>{j.title}</option>)}
        </select>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter candidates…"
            className="w-full h-10 pl-9 pr-4 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <button
          onClick={runAIMatch}
          disabled={!selectedJob || matching || candidates.length === 0}
          className="px-4 h-10 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2 whitespace-nowrap"
        >
          {matching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {matching ? "Matching…" : "Run AI Match"}
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {candidates.map((c) => (
            <div key={c._id} className="card-base space-y-3 hover:shadow-md transition-all">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-sm">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.title ?? "Job Seeker"}</p>
                </div>
                {c.matchScore !== undefined && (
                  <div className="text-right flex-shrink-0">
                    <div className={`text-xl font-bold ${scoreColor(c.matchScore)}`}>{c.matchScore}%</div>
                    <p className="text-xs text-muted-foreground">match</p>
                  </div>
                )}
              </div>

              {c.location && <p className="text-xs text-muted-foreground">{c.location}</p>}

              {c.skills && c.skills.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {c.skills.slice(0, 4).map((s) => (
                    <span key={s} className="px-2 py-0.5 rounded-full bg-muted text-xs">{s}</span>
                  ))}
                  {c.skills.length > 4 && (
                    <span className="px-2 py-0.5 rounded-full bg-muted text-xs text-muted-foreground">+{c.skills.length - 4}</span>
                  )}
                </div>
              )}

              {c.matchBreakdown && (
                <div className="grid grid-cols-2 gap-1 text-xs pt-1 border-t">
                  {Object.entries(c.matchBreakdown).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between">
                      <span className="capitalize text-muted-foreground">{k}</span>
                      <span className="font-medium">{v}%</span>
                    </div>
                  ))}
                </div>
              )}

              <button className="w-full py-1.5 rounded-lg border text-xs font-medium hover:bg-muted/40 flex items-center justify-center gap-1.5">
                <Star className="h-3.5 w-3.5 text-amber-500" /> Shortlist
              </button>
            </div>
          ))}
          {candidates.length === 0 && (
            <div className="col-span-3 text-center py-16 text-muted-foreground text-sm">
              No candidates found
            </div>
          )}
        </div>
      )}
    </div>
  );
}
