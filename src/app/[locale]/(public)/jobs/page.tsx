import { connectDB } from "@/lib/db/mongoose";
import Job from "@/models/Job";
import Link from "next/link";
import type { Metadata } from "next";
import { MapPin, Briefcase, Clock, Search, ChevronLeft, ChevronRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Browse Jobs | mployedin",
  description: "Discover thousands of jobs in the UAE, Saudi Arabia, Qatar and across the GCC. Search by skills, location, and salary.",
  openGraph: {
    title: "Browse Jobs | mployedin",
    description: "Find your next career opportunity in the GCC region.",
    type: "website",
  },
};

const PAGE_SIZE = 20;

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[]>>;
}

function getStr(val: string | string[] | undefined): string {
  return Array.isArray(val) ? val[0] : val ?? "";
}

function salaryLabel(salary: { min?: number; max?: number; currency?: string; isNegotiable?: boolean } | null) {
  if (!salary) return null;
  if (salary.isNegotiable) return "Negotiable";
  if (salary.min && salary.max)
    return `${salary.currency ?? "AED"} ${salary.min.toLocaleString()} – ${salary.max.toLocaleString()}`;
  if (salary.min) return `From ${salary.currency ?? "AED"} ${salary.min.toLocaleString()}`;
  return null;
}

function timeAgo(date: Date): string {
  const diff = Date.now() - new Date(date).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${Math.floor(days / 7) > 1 ? "s" : ""} ago`;
  return `${Math.floor(days / 30)} month${Math.floor(days / 30) > 1 ? "s" : ""} ago`;
}

function closesInDays(expiresAt?: Date | null): number | null {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt).getTime() - Date.now();
  const days = Math.ceil(diff / 86400000);
  return days > 0 ? days : null;
}

export default async function JobsPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const sp = await searchParams;

  const search = getStr(sp.search);
  const location = getStr(sp.location);
  const skills = getStr(sp.skills);
  const currency = getStr(sp.currency);
  const page = Math.max(1, parseInt(getStr(sp.page) || "1"));

  await connectDB();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: Record<string, any> = {
    status: "active",
    $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }],
  };

  if (search) query.$text = { $search: search };
  if (location) {
    query.$or = [
      { "location.city": new RegExp(location, "i") },
      { "location.country": new RegExp(location, "i") },
    ];
  }
  if (skills) query["requirements.skills"] = { $in: skills.split(",").map((s) => s.trim()) };
  if (currency) query["salary.currency"] = currency;

  const skip = (page - 1) * PAGE_SIZE;

  const [jobs, total] = await Promise.all([
    Job.find(query)
      .sort(search ? { score: { $meta: "textScore" } } : { createdAt: -1 })
      .skip(skip)
      .limit(PAGE_SIZE)
      .populate("employerId", "companyName country industry domainVerified")
      .lean(),
    Job.countDocuments(query),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  function buildUrl(overrides: Record<string, string>) {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (location) params.set("location", location);
    if (skills) params.set("skills", skills);
    if (currency) params.set("currency", currency);
    params.set("page", String(page));
    Object.entries(overrides).forEach(([k, v]) => {
      if (v) params.set(k, v);
      else params.delete(k);
    });
    return `/${locale}/jobs?${params.toString()}`;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Hero search bar */}
      <div className="bg-muted/30 border-b border-border">
        <div className="max-w-5xl mx-auto px-4 py-8">
          <h1 className="text-2xl font-semibold text-foreground mb-1">Find your next opportunity</h1>
          <p className="text-muted-foreground text-sm mb-6">
            {total > 0 ? `${total.toLocaleString()} active jobs` : "Browse open positions"}
          </p>

          <form method="GET" action={`/${locale}/jobs`} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                name="search"
                defaultValue={search}
                placeholder="Job title, skills, or keyword"
                className="w-full h-10 pl-9 pr-4 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
            </div>
            <div className="relative sm:w-48">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                name="location"
                defaultValue={location}
                placeholder="City or country"
                className="w-full h-10 pl-9 pr-4 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
            </div>
            <button
              type="submit"
              className="h-10 px-6 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Search
            </button>
          </form>

          {/* Active filters */}
          {(search || location || skills) && (
            <div className="flex flex-wrap gap-2 mt-4">
              {search && (
                <a href={buildUrl({ search: "", page: "1" })} className="flex items-center gap-1 text-xs bg-primary/10 text-primary px-3 py-1 rounded-full hover:bg-primary/20 transition-colors">
                  &ldquo;{search}&rdquo; ✕
                </a>
              )}
              {location && (
                <a href={buildUrl({ location: "", page: "1" })} className="flex items-center gap-1 text-xs bg-primary/10 text-primary px-3 py-1 rounded-full hover:bg-primary/20 transition-colors">
                  📍 {location} ✕
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Job list */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        {jobs.length === 0 ? (
          <div className="text-center py-20">
            <Briefcase className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <h2 className="text-lg font-medium text-foreground mb-2">No jobs found</h2>
            <p className="text-muted-foreground text-sm">Try adjusting your search or clearing filters.</p>
            <a href={`/${locale}/jobs`} className="mt-4 inline-block text-sm text-primary hover:underline">Clear all filters</a>
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const employer = job.employerId as any;
              const salary = job.showSalary !== false ? salaryLabel(job.salary as Parameters<typeof salaryLabel>[0]) : null;
              const daysLeft = closesInDays(job.expiresAt as Date | null);

              return (
                <Link
                  key={String(job._id)}
                  href={`/${locale}/jobs/${job._id}`}
                  className="block bg-card border border-border rounded-xl p-5 hover:border-primary/40 hover:shadow-sm transition-all group"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h2 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                          {job.title}
                        </h2>
                        {employer?.domainVerified && (
                          <span className="shrink-0 text-[10px] bg-green-500/10 text-green-600 px-2 py-0.5 rounded-full font-medium">✓ Verified</span>
                        )}
                        {daysLeft !== null && daysLeft <= 14 && (
                          <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            daysLeft <= 7
                              ? "bg-orange-500/10 text-orange-600"
                              : "bg-yellow-500/10 text-yellow-600"
                          }`}>
                            Closes in {daysLeft}d
                          </span>
                        )}
                      </div>

                      <p className="text-sm text-muted-foreground mb-3">
                        {employer?.companyName ?? "Company"}
                      </p>

                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {job.location?.isRemote ? "Remote" : `${job.location?.city}, ${job.location?.country}`}
                        </span>
                        {salary && (
                          <span className="flex items-center gap-1">
                            <span className="text-muted-foreground/60">💰</span>
                            {salary}
                          </span>
                        )}
                        {job.requirements?.experienceMin != null && (
                          <span className="flex items-center gap-1">
                            <Briefcase className="h-3 w-3" />
                            {job.requirements.experienceMin}–{job.requirements.experienceMax ?? "+"} yrs
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {timeAgo(job.createdAt)}
                        </span>
                      </div>

                      {job.requirements?.skills?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-3">
                          {job.requirements.skills.slice(0, 5).map((s: string) => (
                            <span key={s} className="text-[11px] bg-muted px-2 py-0.5 rounded-md text-muted-foreground">
                              {s}
                            </span>
                          ))}
                          {job.requirements.skills.length > 5 && (
                            <span className="text-[11px] text-muted-foreground/60">+{job.requirements.skills.length - 5} more</span>
                          )}
                        </div>
                      )}
                    </div>

                    {job.vacancies > 1 && (
                      <div className="shrink-0 text-right">
                        <span className="text-xs text-muted-foreground">{job.vacancies} openings</span>
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-10">
            {page > 1 && (
              <a href={buildUrl({ page: String(page - 1) })} className="flex items-center gap-1 text-sm px-4 py-2 rounded-lg border border-border hover:bg-muted transition-colors">
                <ChevronLeft className="h-4 w-4" /> Previous
              </a>
            )}
            <span className="text-sm text-muted-foreground px-4">
              Page {page} of {totalPages}
            </span>
            {page < totalPages && (
              <a href={buildUrl({ page: String(page + 1) })} className="flex items-center gap-1 text-sm px-4 py-2 rounded-lg border border-border hover:bg-muted transition-colors">
                Next <ChevronRight className="h-4 w-4" />
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
