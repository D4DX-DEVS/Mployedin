"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import {
  Search, Building2, MapPin, Globe, Users, Briefcase,
  RotateCcw, Inbox, CheckCircle2, Star,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CompanyItem {
  _id: string;
  companyName: string;
  logo?: string;
  industry?: string;
  companySize?: string;
  city?: string;
  country?: string;
  website?: string;
  description?: string;
  activeJobCount: number;
  domainVerified?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function CompaniesListPage() {
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const pagination = usePagination();

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const params = pagination.paginationParams();
      if (search) params.set("search", search);
      const res = await fetch(`/api/companies?${params}`);
      if (res.ok) {
        const data = await res.json();
        setCompanies(data.items ?? []);
        pagination.updateTotal(data.total ?? 0);
      }
    } catch {
      toast.error("Failed to load companies");
    } finally {
      setLoading(false);
    }
  }, [search, pagination.page, pagination.limit]);

  useEffect(() => { fetchCompanies(); }, [fetchCompanies]);

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Companies</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Explore employers hiring on the platform and discover your next workplace
        </p>
      </section>

      {/* Search */}
      <section className="workspace-panel-surface rounded-[28px] p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search companies by name, industry, or location..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); pagination.resetPage(); }}
              className="pl-9"
            />
          </div>
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); pagination.resetPage(); }}>
            <RotateCcw className="mr-1 h-4 w-4" /> Reset
          </Button>
        </div>
      </section>

      {/* Company Grid */}
      <section className="workspace-panel-surface rounded-[28px] p-5">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : companies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Inbox className="h-12 w-12 text-muted-foreground/40" />
            <p className="mt-4 text-sm font-medium text-muted-foreground">No companies found</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {companies.map((c) => (
              <Link
                key={c._id}
                href={`/job-seeker/companies/${c._id}`}
                className="workspace-glass-panel rounded-2xl p-5 transition-all hover:ring-2 hover:ring-primary/30"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-lg font-bold text-muted-foreground">
                    {c.logo ? (
                      <img src={c.logo} alt={c.companyName} className="h-full w-full rounded-xl object-cover" />
                    ) : (
                      c.companyName.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground truncate">{c.companyName}</p>
                      {c.domainVerified && (
                        <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-emerald-500" />
                      )}
                    </div>
                    {c.industry && (
                      <p className="text-xs text-muted-foreground">{c.industry}</p>
                    )}
                  </div>
                </div>

                {c.description && (
                  <p className="mt-3 text-xs text-muted-foreground line-clamp-2">{c.description}</p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {(c.city || c.country) && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {[c.city, c.country].filter(Boolean).join(", ")}
                    </span>
                  )}
                  {c.companySize && (
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3 w-3" /> {c.companySize}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 text-primary font-medium">
                    <Briefcase className="h-3 w-3" /> {c.activeJobCount} open jobs
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <PaginationControls
        page={pagination.page}
        totalPages={pagination.totalPages}
        limit={pagination.limit}
        total={pagination.total}
        onPageChange={pagination.setPage}
        onLimitChange={pagination.setLimit}
      />
    </div>
  );
}
