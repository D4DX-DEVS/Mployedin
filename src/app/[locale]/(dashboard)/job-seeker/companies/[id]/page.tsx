import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BriefcaseBusiness, Building2, Clock3, Globe, MapPin } from "lucide-react";
import { isValidObjectId } from "mongoose";
import { getTranslations } from "next-intl/server";

import TrackCompanyProfileView from "@/components/features/job-seeker/TrackCompanyProfileView";
import RelativeDate from "@/components/shared/RelativeDate";
import { connectDB } from "@/lib/db/mongoose";
import Employer from "@/models/Employer";
import Job from "@/models/Job";
import { formatCount } from "@/lib/ui/intlFormat";

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

interface EmployerProfile {
  _id: string;
  companyName: string;
  logo?: string;
  description?: string;
  website?: string;
  industry?: string;
  companySize?: string;
  foundedYear?: number;
  city?: string;
  country?: string;
  address?: string;
  domainVerified?: boolean;
  isAgentVerified?: boolean;
  verificationLevel?: "basic" | "company" | "premium";
  responseTimeCommitment?: number;
  socialLinks?: {
    linkedin?: string;
    twitter?: string;
    facebook?: string;
    instagram?: string;
  };
}

interface EmployerJob {
  _id: string;
  title: string;
  location?: {
    city?: string;
    country?: string;
    isRemote?: boolean;
  };
  salary?: {
    min?: number;
    max?: number;
    currency?: string;
  };
  requirements?: {
    experienceMin?: number;
    experienceMax?: number;
  };
  createdAt: Date | string;
}

function initials(name: string) {
  return name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function normalizeExternalUrl(url?: string) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

function salaryLabel(salary?: EmployerJob["salary"], salaryFromLabel?: string) {
  if (!salary?.min && !salary?.max) return null;
  if (salary.min && salary.max) {
    return `${salary.currency ?? "AED"} ${formatCount(salary.min)} - ${formatCount(salary.max)}`;
  }
  if (salary.min) {
    return `${salaryFromLabel || "From"} ${salary.currency ?? "AED"} ${formatCount(salary.min)}`;
  }
  return null;
}

function employerLocation(employer: EmployerProfile, locationFlexibleLabel?: string) {
  return [employer.city, employer.country].filter(Boolean).join(", ") || employer.address || locationFlexibleLabel || "Location flexible";
}

const getEmployerProfile = cache(async (id: string) => {
  if (!isValidObjectId(id)) {
    return null;
  }

  await connectDB();

  const employer = await Employer.findById(id)
    .select(
      "companyName logo description website industry companySize foundedYear city country address domainVerified isAgentVerified verificationLevel responseTimeCommitment socialLinks"
    )
    .lean()
    .catch(() => null);

  if (!employer) {
    return null;
  }

  const activeJobs = await Job.find({
    employerId: id,
    status: "active",
    $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gte: new Date() } }],
  })
    .sort({ createdAt: -1 })
    .limit(6)
    .select("title location salary requirements createdAt")
    .lean();

  return {
    employer: JSON.parse(JSON.stringify(employer)) as EmployerProfile,
    activeJobs: JSON.parse(JSON.stringify(activeJobs)) as EmployerJob[],
  };
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const profile = await getEmployerProfile(id);

  if (!profile) {
    return { title: "Company Not Found" };
  }

  const description =
    profile.employer.description?.slice(0, 160) ??
    `Explore jobs and company information for ${profile.employer.companyName}.`;

  return {
    title: profile.employer.companyName,
    description,
    openGraph: {
      title: `${profile.employer.companyName} | mployedin`,
      description,
      type: "website",
    },
  };
}

export default async function JobSeekerCompanyPage({ params }: PageProps) {
  const { locale, id } = await params;
  const t = await getTranslations("jobSeekerCompanyDetail");
  const tn = await getTranslations("nav");
  const profile = await getEmployerProfile(id);

  if (!profile) {
    notFound();
  }

  const { employer, activeJobs } = profile;
  const websiteUrl = normalizeExternalUrl(employer.website);
  const socialLinks = [
    employer.socialLinks?.linkedin,
    employer.socialLinks?.twitter,
    employer.socialLinks?.facebook,
    employer.socialLinks?.instagram,
  ]
    .map((url) => normalizeExternalUrl(url))
    .filter((url): url is string => Boolean(url));

  return (
    <>
      <TrackCompanyProfileView employerId={id} />

      <div className="min-h-screen bg-background">
        <div className="border-b border-border bg-muted/20">
          <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3 text-xs text-muted-foreground">
            <Link href={`/${locale}/job-seeker/jobs`} className="transition-colors hover:text-foreground">
              {tn("jobSearch")}
            </Link>
            <span>/</span>
            <span className="truncate text-foreground">{employer.companyName}</span>
          </div>
        </div>

        <div className="mx-auto max-w-6xl px-4 py-5 sm:py-8">
          <section className="overflow-hidden rounded-lg sm:rounded-[30px] border border-border/60 bg-gradient-to-br from-card via-card to-primary/[0.05] shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
            <div className="h-20 sm:h-28 md:h-36 bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.24),_transparent_40%),linear-gradient(135deg,_rgba(15,23,42,0.08),_rgba(37,99,235,0.12))]" />

            <div className="px-4 pb-4 sm:px-6 sm:pb-6 md:px-8 md:pb-8">
              <div className="-mt-12 flex flex-col gap-4 sm:-mt-14 md:-mt-16 sm:flex-row sm:items-end sm:justify-between sm:gap-5">
                <div className="flex items-end gap-3 sm:gap-4">
                  <div className="flex h-20 w-20 sm:h-24 sm:w-24 md:h-28 md:w-28 items-center justify-center overflow-hidden rounded-xl sm:rounded-[26px] border border-border/70 bg-background text-xl sm:text-2xl font-semibold text-foreground shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
                    {employer.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={employer.logo} alt={`${employer.companyName} logo`} className="h-full w-full object-cover" />
                    ) : (
                      initials(employer.companyName)
                    )}
                  </div>

                  <div className="pb-1">
                    <div className="inline-flex rounded-full border border-primary/10 bg-primary/[0.06] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                      {t("companyProfile")}
                    </div>
                    <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl lg:text-[2.25rem]">
                      {employer.companyName}
                    </h1>
                    <div className="mt-2 flex flex-wrap gap-2 text-sm text-muted-foreground">
                      {employer.industry && (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/90 px-3 py-1.5">
                          <Building2 className="h-4 w-4" />
                          {employer.industry}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/90 px-3 py-1.5">
                        <MapPin className="h-4 w-4" />
                        {employerLocation(employer)}
                      </span>
                      {employer.foundedYear && (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/90 px-3 py-1.5">
                          Founded {employer.foundedYear}
                        </span>
                      )}
                      {employer.companySize && (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/90 px-3 py-1.5">
                          {employer.companySize}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  {websiteUrl && (
                    <a
                      href={websiteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/90 px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-primary/30 hover:text-primary"
                    >
                      <Globe className="h-4 w-4" />
                      {t("visitWebsite")}
                    </a>
                  )}
                  <Link
                    href={`/${locale}/job-seeker/jobs`}
                    className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    {t("backToJobs")}
                  </Link>
                </div>
              </div>
            </div>
          </section>

          <div className="mt-5 sm:mt-6 grid gap-5 sm:gap-6 lg:grid-cols-[minmax(0,1.7fr)_320px]">
            <div className="space-y-5 sm:space-y-6">
              <section className="card-base rounded-lg sm:rounded-[28px] panel-body">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{t("aboutSection")}</div>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">{t("whatCompanyHiring")}</h2>
                <p className="mt-4 text-sm leading-7 text-muted-foreground">
                  {employer.description?.trim() || `${employer.companyName} is actively hiring on Mployedin. Explore open roles, company details, and trust signals before you apply.`}
                </p>
              </section>

              <section className="card-base rounded-lg sm:rounded-[28px] panel-body">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{t("openRoles")}</div>
                    <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">{t("jobsFromCompany", { company: employer.companyName })}</h2>
                  </div>
                  <span className="rounded-full border border-border/60 bg-muted/20 px-3 py-1 text-xs font-medium text-muted-foreground">
                    {activeJobs.length} {activeJobs.length === 1 ? t("activeRolesSingular") : t("activeRolesPlural")}
                  </span>
                </div>

                {activeJobs.length > 0 ? (
                  <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                    {activeJobs.map((job) => {
                      const salary = salaryLabel(job.salary, t("salaryFrom"));
                      const locationLabel = job.location?.isRemote
                        ? t("remote")
                        : [job.location?.city, job.location?.country].filter(Boolean).join(", ") || t("locationFlexible");

                      return (
                        <Link
                          key={job._id}
                          href={`/${locale}/job-seeker/jobs/${job._id}`}
                          className="group rounded-lg sm:rounded-[22px] border border-border/70 bg-[linear-gradient(135deg,_rgba(255,255,255,0.98),_rgba(248,250,252,0.96))] p-3 sm:p-4 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_20px_45px_-34px_rgba(37,99,235,0.18)]"
                        >
                          <p className="line-clamp-2 text-base font-semibold text-foreground transition-colors group-hover:text-primary">
                            {job.title}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-muted-foreground">
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/20 px-2.5 py-1">
                              <MapPin className="h-3 w-3" />
                              {locationLabel}
                            </span>
                            {(job.requirements?.experienceMin != null || job.requirements?.experienceMax != null) && (
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/20 px-2.5 py-1">
                                <BriefcaseBusiness className="h-3 w-3" />
                                {job.requirements?.experienceMin ?? 0}-{job.requirements?.experienceMax ?? 0} {t("yearsAbbr")}
                              </span>
                            )}
                            {salary && (
                              <span className="inline-flex rounded-full border border-border/60 bg-muted/20 px-2.5 py-1">
                                {salary}
                              </span>
                            )}
                          </div>
                          <div className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                            <Clock3 className="h-3.5 w-3.5" />
                            <RelativeDate date={job.createdAt} prefix="Posted" />
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-5 rounded-lg sm:rounded-[22px] border border-border/70 bg-muted/20 px-4 py-5 text-sm text-muted-foreground">
                    {t("noActiveJobs")}
                  </div>
                )}
              </section>
            </div>

            <div className="space-y-4 sm:space-y-5 lg:sticky lg:top-6 lg:self-start">
              <section className="card-base rounded-lg sm:rounded-[28px] panel-body">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{t("trustSignals")}</div>
                <h3 className="mt-1 text-lg font-semibold tracking-tight text-foreground">{t("companySnapshot")}</h3>
                <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                  <div className="rounded-lg sm:rounded-[20px] border border-border/60 bg-muted/20 px-3 sm:px-4 py-2 sm:py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{t("verification")}</div>
                    <p className="mt-1 font-medium text-foreground">
                      {(employer.domainVerified || employer.isAgentVerified) ? t("verifiedEmployer") : t("verificationLevelLabel", { level: employer.verificationLevel ?? "basic" })}
                    </p>
                  </div>
                  {employer.responseTimeCommitment ? (
                    <div className="rounded-lg sm:rounded-[20px] border border-border/60 bg-muted/20 px-3 sm:px-4 py-2 sm:py-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{t("responseTime")}</div>
                      <p className="mt-1 font-medium text-foreground">
                        {t("typicallyResponds", { days: employer.responseTimeCommitment, plural: employer.responseTimeCommitment === 1 ? "" : "s" })}
                      </p>
                    </div>
                  ) : null}
                  <div className="rounded-lg sm:rounded-[20px] border border-border/60 bg-muted/20 px-3 sm:px-4 py-2 sm:py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{t("hiringActivity")}</div>
                    <p className="mt-1 font-medium text-foreground">{activeJobs.length} {t("activeRolesOnPlatform", { plural: activeJobs.length === 1 ? "" : "s" })}</p>
                  </div>
                </div>
              </section>

              <section className="card-base rounded-lg sm:rounded-[28px] panel-body">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{t("links")}</div>
                <h3 className="mt-1 text-lg font-semibold tracking-tight text-foreground">{t("exploreFurther")}</h3>
                <div className="mt-4 space-y-3">
                  {websiteUrl && (
                    <a
                      href={websiteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between rounded-lg sm:rounded-[20px] border border-border/60 px-3 sm:px-4 py-2.5 sm:py-3 text-sm font-medium transition-colors hover:bg-muted/40"
                    >
                      <span>{t("companyWebsite")}</span>
                      <Globe className="h-4 w-4 text-muted-foreground" />
                    </a>
                  )}
                  {socialLinks.slice(0, 3).map((url) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between rounded-lg sm:rounded-[20px] border border-border/60 px-3 sm:px-4 py-2.5 sm:py-3 text-sm font-medium transition-colors hover:bg-muted/40"
                    >
                      <span>{url.replace(/^https?:\/\//i, "")}</span>
                      <Globe className="h-4 w-4 text-muted-foreground" />
                    </a>
                  ))}
                  <Link
                    href={`/${locale}/job-seeker/jobs?employerId=${id}`}
                    className="flex items-center justify-between rounded-lg sm:rounded-[20px] border border-border/60 px-3 sm:px-4 py-2.5 sm:py-3 text-sm font-medium transition-colors hover:bg-muted/40"
                  >
                    <span>{t("backToSearchEmployer")}</span>
                    <BriefcaseBusiness className="h-4 w-4 text-muted-foreground" />
                  </Link>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}