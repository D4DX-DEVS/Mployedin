"use client";

import { useState } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Search, Sparkles, MapPin, Clock, Briefcase, Loader2 } from "lucide-react";

interface Job {
  _id: string;
  title: string;
  location: string;
  category: string;
  employmentType: string;
  salary?: { min: number; max: number; currency: string };
  description?: string;
  createdAt: string;
  matchScore?: number;
}

const PROMPTS = [
  "Remote frontend developer role with React in Dubai",
  "Full-stack engineer with Node.js, 3-5 years, Abu Dhabi or remote",
  "Marketing manager in Saudi Arabia, salary above SAR 15,000",
  "Entry level finance roles in Bahrain or Kuwait",
];

export default function JobSeekerNLSearchPage() {
  const [query, setQuery] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");

  const search = async (q?: string) => {
    const searchQuery = q ?? query;
    if (!searchQuery.trim()) return;
    setLoading(true);
    setError("");
    setSearched(false);
    try {
      const res = await fetch(`/api/jobs/search?q=${encodeURIComponent(searchQuery)}&nl=true`);
      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();
      setJobs(data.jobs ?? []);
      setSearched(true);
    } catch {
      // Fallback to basic search
      try {
        const res2 = await fetch(`/api/jobs?search=${encodeURIComponent(searchQuery)}&limit=20`);
        if (res2.ok) {
          const data = await res2.json();
          setJobs(data.jobs ?? []);
          setSearched(true);
        }
      } catch { setError("Search failed. Please try again."); }
    } finally {
      setLoading(false);
    }
  };

  const scoreColor = (score?: number) => {
    if (!score) return "";
    if (score >= 80) return "text-green-600 bg-green-50 border-green-200";
    if (score >= 60) return "text-amber-600 bg-amber-50 border-amber-200";
    return "text-muted-foreground bg-muted";
  };

  return (
    <div className="page-container">
      <PageHeader
        title="AI Job Search"
        description='Search jobs in plain English — "I want a senior DevOps role in Dubai with remote option"'
      />

      {/* Search bar */}
      <div className="card-base space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              placeholder='e.g. "Senior React developer Dubai salary AED 15k minimum"'
              className="input-field w-full h-11 pl-9 pr-4 rounded-xl"
            />
          </div>
          <button
            onClick={() => search()}
            disabled={!query.trim() || loading}
            className="btn-primary h-11 rounded-xl disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {PROMPTS.map((p) => (
            <button
              key={p}
              onClick={() => { setQuery(p); search(p); }}
              className="btn-pill"
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Results */}
      {searched && (
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-3">
            {jobs.length} result{jobs.length !== 1 ? "s" : ""} found
          </p>
          <div className="space-y-3">
            {jobs.length === 0 ? (
              <div className="card-base text-center py-12">
                <Search className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground text-sm">No jobs match your search. Try different keywords.</p>
              </div>
            ) : (
              jobs.map((job) => (
                <div key={job._id} className="card-base hover:shadow-md transition-all">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="font-semibold">{job.title}</h3>
                        {job.matchScore !== undefined && (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${scoreColor(job.matchScore)}`}>
                            {job.matchScore}% match
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{job.location}</span>
                        <span className="flex items-center gap-1"><Briefcase className="h-3.5 w-3.5" />{job.category}</span>
                        <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />
                          {new Date(job.createdAt).toLocaleDateString()}
                        </span>
                        {job.salary && (
                          <span className="font-medium text-foreground">
                            {job.salary.currency} {job.salary.min?.toLocaleString()}–{job.salary.max?.toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={job.employmentType.replace("_", " ")} />
                      <a
                        href={`./jobs/${job._id}`}
                        className="btn-primary text-xs px-3 py-1.5"
                      >
                        Apply
                      </a>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
