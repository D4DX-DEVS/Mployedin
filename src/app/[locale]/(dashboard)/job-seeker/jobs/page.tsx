"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { Search, MapPin, DollarSign, Briefcase, Filter, X, Clock, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/shared/PageHeader";
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

interface Pagination { page: number; limit: number; total: number; pages: number; }

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
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [location, setLocation] = useState("");
  const [currency, setCurrency] = useState("");
  const [appliedJobs, setAppliedJobs] = useState<Set<string>>(new Set());

  useEffect(() => {
    document.title = "Find Jobs · MPLOYEDIN";
    fetchApplied();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => fetchJobs(1), 400);
    return () => clearTimeout(timer);
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

  const fetchJobs = useCallback(async (page: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (search) params.set("search", search);
      if (category) params.set("category", category);
      if (location) params.set("location", location);
      if (currency) params.set("currency", currency);

      const res = await fetch(`/api/jobs?${params}`);
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs);
        setPagination(data.pagination);
      }
    } finally {
      setLoading(false);
    }
  }, [search, category, location, currency]);

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

  const activeFilters = [category, location, currency].filter(Boolean).length;

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <PageHeader
        title="Find Jobs"
        description={`${pagination.total.toLocaleString()} active opportunities`}
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
                <SelectItem value="">All categories</SelectItem>
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
                <SelectItem value="">Any currency</SelectItem>
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

                  <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
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
      {pagination.pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline" size="sm"
            disabled={pagination.page <= 1}
            onClick={() => fetchJobs(pagination.page - 1)}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {pagination.page} of {pagination.pages}
          </span>
          <Button
            variant="outline" size="sm"
            disabled={pagination.page >= pagination.pages}
            onClick={() => fetchJobs(pagination.page + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
