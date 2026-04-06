"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { Search, MapPin, DollarSign, Briefcase, Filter, X, Clock, Building2, Bookmark, BookmarkCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/shared/PageHeader";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { useTranslations } from "next-intl";

interface Job {
  _id: string;
  title: string;
  location: string;
  category: string;
  description: string;
  requirements: { skills: string[]; experienceMin: number };
  salary: { min: number; max: number; currency: string };
  employerId: { companyName?: string; country?: string; industry?: string };
  createdAt: string;
  expiresAt?: string;
}

const JOB_CATEGORIES = [
  "Technology", "Healthcare", "Finance", "Construction", "Hospitality",
  "Education", "Manufacturing", "Logistics", "Oil & Gas", "Retail", "Other"
];

const CURRENCIES = ["USD", "SAR", "AED", "QAR", "KWD", "BHD", "OMR"];

export default function JobSearchPage() {
  const t = useTranslations();
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();

  const [jobs, setJobs] = useState<Job[]>([]);
  const pgn = usePagination();
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [location, setLocation] = useState("");
  const [currency, setCurrency] = useState("all");
  const [appliedJobs, setAppliedJobs] = useState<Set<string>>(new Set());
  const [savedJobs, setSavedJobs] = useState<Set<string>>(new Set());

  useEffect(() => {
    document.title = "Find Jobs · MPLOYEDIN";
    fetchApplied();
    fetchSavedJobs();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => fetchJobs(), 400);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, category, location, currency, pgn.page, pgn.limit]);

  useEffect(() => {
    pgn.resetPage();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, category, location, currency]);

  async function fetchApplied() {
    try {
      const res = await fetch("/api/applications?limit=200");
      if (res.ok) {
        const data = await res.json();
        const ids = new Set<string>(data.applications.map((a: { jobId: { _id: string } | string }) =>
          typeof a.jobId === "object" ? a.jobId._id : a.jobId
        ));
        setAppliedJobs(ids);
      }
    } catch {/* silent */}
  }

  async function fetchSavedJobs() {
    try {
      const res = await fetch("/api/saved-jobs?limit=200");
      if (res.ok) {
        const data = await res.json();
        const ids = new Set<string>(data.items.map((s: { jobId: { _id: string } | string; _id: string }) =>
          typeof s.jobId === "object" ? s.jobId._id : s.jobId
        ));
        setSavedJobs(ids);
      }
    } catch {/* silent */}
  }

  async function toggleSaveJob(jobId: string) {
    if (savedJobs.has(jobId)) {
      // Find the saved job entry to delete
      try {
        const res = await fetch("/api/saved-jobs?limit=200");
        if (res.ok) {
          const data = await res.json();
          const entry = data.items.find((s: { jobId: { _id: string } | string }) => {
            const id = typeof s.jobId === "object" ? s.jobId._id : s.jobId;
            return id === jobId;
          });
          if (entry) {
            await fetch(`/api/saved-jobs/${entry._id}`, { method: "DELETE" });
            setSavedJobs((prev) => { const next = new Set(prev); next.delete(jobId); return next; });
          }
        }
      } catch {/* silent */}
    } else {
      try {
        const res = await fetch("/api/saved-jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId }),
        });
        if (res.ok) {
          setSavedJobs((prev) => new Set([...prev, jobId]));
        }
      } catch {/* silent */}
    }
  }

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const params = pgn.paginationParams();
      if (search) params.set("search", search);
      if (category && category !== "all") params.set("category", category);
      if (location) params.set("location", location);
      if (currency && currency !== "all") params.set("currency", currency);

      const res = await fetch(`/api/jobs?${params}`);
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs);
        pgn.updateTotal(data.pagination?.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [search, category, location, currency, pgn.page, pgn.limit]);

  async function applyToJob(jobId: string) {
    const res = await fetch("/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId }),
    });
    if (res.ok) {
      setAppliedJobs((prev) => new Set([...prev, jobId]));
    }
  }

  const activeFilters = [category, location, currency].filter(v => v && v !== "all").length;

  return (
    <div className="page-container">
      <PageHeader
        title="Find Jobs"
        description={`${pgn.total.toLocaleString()} active opportunities`}
      />

      {/* Search bar */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search job title, skills, keywords…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ps-10"
          />
          {search && (
            <button className="absolute end-3 top-1/2 -translate-y-1/2" onClick={() => setSearch("")}>
              <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
            </button>
          )}
        </div>
        <Button
          variant={showFilters ? "default" : "outline"}
          onClick={() => setShowFilters(!showFilters)}
          className="relative"
        >
          <Filter className="w-4 h-4 me-2" />Filters
          {activeFilters > 0 && (
            <span className="absolute -top-1.5 -end-1.5 w-4 h-4 bg-destructive text-destructive-foreground text-xs rounded-full flex items-center justify-center">
              {activeFilters}
            </span>
          )}
        </Button>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="card-base grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Category</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue placeholder="All categories" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {JOB_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Location</label>
            <Input
              placeholder="e.g. Dubai, Riyadh…"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Salary currency</label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger><SelectValue placeholder="Any currency" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any currency</SelectItem>
                {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {activeFilters > 0 && (
            <div className="sm:col-span-3 flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => { setCategory(""); setLocation(""); setCurrency(""); }}>
                <X className="w-3 h-3 me-1" /> Clear filters
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Job list */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card-base animate-pulse">
              <div className="h-5 bg-muted rounded w-1/3 mb-2" />
              <div className="h-4 bg-muted rounded w-1/4 mb-4" />
              <div className="h-3 bg-muted rounded w-full mb-1" />
              <div className="h-3 bg-muted rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="card-base text-center py-16">
          <Briefcase className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-semibold mb-1">No jobs found</h3>
          <p className="text-sm text-muted-foreground">Try different keywords or remove some filters</p>
        </div>
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => {
            const isApplied = appliedJobs.has(job._id);
            const daysAgo = Math.floor((Date.now() - new Date(job.createdAt).getTime()) / 86400000);
            return (
              <div key={job._id} className="card-base hover:shadow-md transition-shadow cursor-pointer group"
                onClick={() => router.push(`/${locale}/job-seeker/jobs/${job._id}`)}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                        {job.title}
                      </h3>
                      {job.category && (
                        <Badge variant="secondary" className="text-xs">{job.category}</Badge>
                      )}
                      {daysAgo === 0 && <Badge className="text-xs bg-emerald-100 text-emerald-700 border-emerald-200">New</Badge>}
                    </div>

                    <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap mb-3">
                      {job.employerId?.companyName && (
                        <span className="flex items-center gap-1">
                          <Building2 className="w-3 h-3" /> {job.employerId.companyName}
                        </span>
                      )}
                      {job.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {job.location}
                        </span>
                      )}
                      {job.salary?.min && (
                        <span className="flex items-center gap-1">
                          <DollarSign className="w-3 h-3" />
                          {job.salary.min.toLocaleString()} – {job.salary.max.toLocaleString()} {job.salary.currency}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {daysAgo === 0 ? "Today" : `${daysAgo}d ago`}
                      </span>
                    </div>

                    {job.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{job.description}</p>
                    )}

                    {job.requirements?.skills?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {job.requirements.skills.slice(0, 5).map((s) => (
                          <Badge key={s} variant="outline" className="text-xs">{s}</Badge>
                        ))}
                        {job.requirements.skills.length > 5 && (
                          <Badge variant="outline" className="text-xs">+{job.requirements.skills.length - 5}</Badge>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="shrink-0 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 w-9 p-0"
                      onClick={() => toggleSaveJob(job._id)}
                      title={savedJobs.has(job._id) ? "Unsave job" : "Save job"}
                    >
                      {savedJobs.has(job._id) ? (
                        <BookmarkCheck className="h-4 w-4 text-primary" />
                      ) : (
                        <Bookmark className="h-4 w-4" />
                      )}
                    </Button>
                    {isApplied ? (
                      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Applied ✓</Badge>
                    ) : (
                      <Button size="sm" onClick={() => applyToJob(job._id)}>
                        Apply Now
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      <PaginationControls
        page={pgn.page}
        totalPages={pgn.totalPages}
        total={pgn.total}
        limit={pgn.limit}
        onPageChange={pgn.setPage}
        onLimitChange={pgn.setLimit}
      />
    </div>
  );
}
