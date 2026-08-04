import { connectDB } from "@/lib/db/mongoose";
import Job from "@/models/Job";
import "@/models/Employer"; // register schema for .populate("employerId")
import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { MapPin, Briefcase, Clock, Search, ChevronLeft, ChevronRight } from "lucide-react";
import RelativeDate from "@/components/shared/RelativeDate";

// Revalidate every 60 seconds — fresh job listings without blocking every request
export const revalidate = 60;
// searchParams opt-out static rendering per-request but ISR still applies
export const dynamic = "force-dynamic";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://mployedin-8a4rc.ondigitalocean.app";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === "ar";
  const canonicalUrl = `${BASE_URL}/${locale}/jobs`;

  return {
    title: isAr
      ? "تصفح الوظائف"
      : "Browse Jobs in UAE, GCC & Worldwide",
    description: isAr
      ? "اكتشف آلاف الوظائف في الإمارات والسعودية وقطر ودول الخليج. ابحث حسب المهارات والموقع والراتب."
      : "Discover thousands of jobs in the UAE, Saudi Arabia, Qatar and across the GCC. Search by skills, location, and salary.",
    alternates: {
      canonical: canonicalUrl,
      languages: {
        en: `${BASE_URL}/en/jobs`,
        ar: `${BASE_URL}/ar/jobs`,
        "x-default": `${BASE_URL}/en/jobs`,
      },
    },
    openGraph: {
      title: isAr
        ? "تصفح الوظائف | MPLOYEDIN"
        : "Browse Jobs in UAE, GCC & Worldwide | MPLOYEDIN",
      description: isAr
        ? "ابحث عن فرصتك المهنية القادمة في دول الخليج والعالم."
        : "Find your next career opportunity across the GCC region and worldwide.",
      type: "website",
      url: canonicalUrl,
    },
  };
}

const PAGE_SIZE = 20;

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[]>>;
}

function getStr(val: string | string[] | undefined): string {
  return Array.isArray(val) ? val[0] : val ?? "";
}

type Translator = (key: string, values?: Record<string, string | number>) => string;

function getNumberLocale(locale: string): string {
  return locale === "ar" ? "ar-SA" : "en-US";
}

function salaryLabel(
  salary: { min?: number; max?: number; currency?: string; isNegotiable?: boolean } | null,
  locale: string,
  t: Translator
) {
  if (!salary) return null;
  if (salary.isNegotiable) return t("negotiable");
  const numberLocale = getNumberLocale(locale);
  const currency = salary.currency ?? "AED";
  if (salary.min && salary.max)
    return `${currency} ${salary.min.toLocaleString(numberLocale)} – ${salary.max.toLocaleString(numberLocale)}`;
  if (salary.min) return t("fromSalary", { amount: `${currency} ${salary.min.toLocaleString(numberLocale)}` });
  return null;
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
  const t = await getTranslations("publicJobs");
  const numberLocale = getNumberLocale(locale);
  const PreviousIcon = locale === "ar" ? ChevronRight : ChevronLeft;
  const NextIcon = locale === "ar" ? ChevronLeft : ChevronRight;

  const search = getStr(sp.search);
  const location = getStr(sp.location);
  const skills = getStr(sp.skills);
  const currency = getStr(sp.currency);
  const page = Math.max(1, parseInt(getStr(sp.page) || "1"));

  await connectDB();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: Record<string, any> = {
    status: "active",
    $and: [
      { $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }] },
    ],
  };

  if (search) query.$text = { $search: search };
  if (location) {
    query.$and.push({
      $or: [
        { "location.city": new RegExp(location, "i") },
        { "location.country": new RegExp(location, "i") },
      ],
    });
  }
  if (skills) query["requirements.skills"] = { $in: skills.split(",").map((s) => s.trim()) };
  if (currency) query["salary.currency"] = currency;

  const skip = (page - 1) * PAGE_SIZE;

  const [jobs, total] = await Promise.all([
    Job.find(query)
      .sort(search ? { score: { $meta: "textScore" } } : { createdAt: -1 })
      .skip(skip)
      .limit(PAGE_SIZE)
      .populate("employerId", "companyName country industry domainVerified isAgentVerified")
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
          <h1 className="text-2xl font-semibold text-foreground mb-1">{t("heading")}</h1>
          <p className="text-muted-foreground text-sm mb-6">
            {total > 0 ? t("activeJobs", { total: total.toLocaleString(numberLocale) }) : t("browseOpenPositions")}
          </p>

          <form method="GET" action={`/${locale}/jobs`} className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <div className="relative flex-1">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                name="search"
                defaultValue={search}
                placeholder={t("searchPlaceholder")}
                className="w-full h-10 ps-9 pe-4 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
            </div>
            <div className="relative sm:w-48">
              <MapPin className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                name="location"
                defaultValue={location}
                placeholder={t("locationPlaceholder")}
                className="w-full h-10 ps-9 pe-4 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
            </div>
            <button
              type="submit"
              className="h-10 px-4 sm:px-6 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors whitespace-nowrap"
            >
              {t("search")}
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
            <h2 className="text-lg font-medium text-foreground mb-2">{t("noJobsFound")}</h2>
            <p className="text-muted-foreground text-sm">{t("adjustSearch")}</p>
            <a href={`/${locale}/jobs`} className="mt-4 inline-block text-sm text-primary hover:underline">{t("clearFilters")}</a>
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const employer = job.employerId as any;
              const salary = job.showSalary !== false ? salaryLabel(job.salary as Parameters<typeof salaryLabel>[0], locale, t) : null;
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
                        {(employer?.domainVerified || employer?.isAgentVerified) && (
                          <span className="shrink-0 text-[10px] bg-green-500/10 text-green-600 px-2 py-0.5 rounded-full font-medium">✓ {t("verified")}</span>
                        )}
                        {daysLeft !== null && daysLeft <= 14 && (
                          <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            daysLeft <= 7
                              ? "bg-orange-500/10 text-orange-600"
                              : "bg-yellow-500/10 text-yellow-600"
                          }`}>
                            {t("closesInDays", { days: daysLeft.toLocaleString(numberLocale) })}
                          </span>
                        )}
                      </div>

                      <p className="text-sm text-muted-foreground mb-3">
                        {employer?.companyName ?? t("companyFallback")}
                      </p>

                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {job.location?.isRemote ? t("remote") : [job.location?.city, job.location?.country].filter(Boolean).join(", ")}
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
                            {job.requirements.experienceMin.toLocaleString(numberLocale)}–{job.requirements.experienceMax?.toLocaleString(numberLocale) ?? "+"} {t("years")}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <RelativeDate date={job.createdAt} />
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
                            <span className="text-[11px] text-muted-foreground/60">{t("moreSkills", { count: job.requirements.skills.length - 5 })}</span>
                          )}
                        </div>
                      )}
                    </div>

                    {job.vacancies > 1 && (
                      <div className="shrink-0 text-end">
                        <span className="text-xs text-muted-foreground">{t("openings", { count: Number(job.vacancies).toLocaleString(numberLocale) })}</span>
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
                <PreviousIcon className="h-4 w-4" /> {t("previous")}
              </a>
            )}
            <span className="text-sm text-muted-foreground px-4">
              {t("pageOf", { page: page.toLocaleString(numberLocale), totalPages: totalPages.toLocaleString(numberLocale) })}
            </span>
            {page < totalPages && (
              <a href={buildUrl({ page: String(page + 1) })} className="flex items-center gap-1 text-sm px-4 py-2 rounded-lg border border-border hover:bg-muted transition-colors">
                {t("next")} <NextIcon className="h-4 w-4" />
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
