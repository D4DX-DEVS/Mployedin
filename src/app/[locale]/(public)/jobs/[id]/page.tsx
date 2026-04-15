import { connectDB } from "@/lib/db/mongoose";
import Job from "@/models/Job";
import { Employer } from "@/models/Employer";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MapPin, Briefcase, Clock, Users, Globe } from "lucide-react";
import Link from "next/link";
import EasyApply from "@/components/features/public/EasyApply";
import TrackJobView from "@/components/features/public/TrackJobView";
import { SimilarJobs } from "@/components/features/job-seeker/SimilarJobs";

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  await connectDB();
  const job = await Job.findById(id)
    .populate("employerId", "companyName")
    .lean()
    .catch(() => null);

  if (!job) return { title: "Job Not Found | mployedin" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const employer = job.employerId as any;
  const title = `${job.title} at ${employer?.companyName ?? "Company"} | mployedin`;

  return {
    title,
    description: job.description?.slice(0, 160),
    openGraph: { title, description: job.description?.slice(0, 160), type: "website" },
  };
}

function timeAgo(date: Date): string {
  const diff = Date.now() - new Date(date).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function closesInDays(expiresAt?: Date | null): number | null {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt).getTime() - Date.now();
  const days = Math.ceil(diff / 86400000);
  return days > 0 ? days : null;
}

function salaryLabel(salary: { min?: number; max?: number; currency?: string; isNegotiable?: boolean } | null) {
  if (!salary) return null;
  if (salary.isNegotiable) return "Negotiable";
  if (salary.min && salary.max)
    return `${salary.currency ?? "AED"} ${salary.min.toLocaleString()} – ${salary.max.toLocaleString()} / month`;
  if (salary.min) return `From ${salary.currency ?? "AED"} ${salary.min.toLocaleString()} / month`;
  return null;
}

function renderJobDescription(text: string) {
  const parts = text.split(/(?=^## )/m);
  return parts.map((part, i) => {
    const headerMatch = part.match(/^## (.+?)\n?([\s\S]*)/);
    if (headerMatch) {
      return (
        <div key={i} className={i > 0 ? "mt-4" : undefined}>
          <h3 className="text-sm font-semibold text-foreground mb-1.5">{headerMatch[1].trim()}</h3>
          {headerMatch[2].trim() && (
            <p className="text-sm leading-relaxed text-muted-foreground text-justify">{headerMatch[2].trim()}</p>
          )}
        </div>
      );
    }
    const trimmed = part.trim();
    return trimmed ? <p key={i} className="text-sm leading-relaxed text-muted-foreground text-justify">{trimmed}</p> : null;
  });
}

export default async function JobDetailPage({ params }: PageProps) {
  const { locale, id } = await params;

  await connectDB();
  const job = await Job.findById(id)
    .populate("employerId", "companyName country industry city website domainVerified")
    .lean()
    .catch(() => null);

  if (!job || job.status !== "active") notFound();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const employer = job.employerId as any;

  // Fetch employer response-time commitment for display
  let responseTimeDays: number | null = null;
  if (employer?._id) {
    const emp = await Employer.findById(employer._id)
      .select("responseTimeCommitment")
      .lean();
    responseTimeDays = (emp as unknown as { responseTimeCommitment?: number })?.responseTimeCommitment ?? null;
  }
  const salary = job.showSalary !== false ? salaryLabel(job.salary as Parameters<typeof salaryLabel>[0]) : null;
  const daysLeft = closesInDays(job.expiresAt as Date | null);

  // JSON-LD structured data for Google Jobs
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description: job.description,
    datePosted: job.createdAt,
    validThrough: job.expiresAt,
    hiringOrganization: {
      "@type": "Organization",
      name: employer?.companyName ?? "Company",
    },
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: job.location?.city,
        addressCountry: job.location?.country,
      },
    },
    ...(job.location?.isRemote && { jobLocationType: "TELECOMMUTE" }),
    ...(job.salary?.min && {
      baseSalary: {
        "@type": "MonetaryAmount",
        currency: job.salary.currency ?? "AED",
        value: {
          "@type": "QuantitativeValue",
          minValue: job.salary.min,
          maxValue: job.salary.max,
          unitText: "MONTH",
        },
      },
    }),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <TrackJobView jobId={String(job._id)} />

      <div className="min-h-screen bg-background">
        {/* Breadcrumb */}
        <div className="border-b border-border bg-muted/20">
          <div className="max-w-5xl mx-auto px-4 py-3 text-xs text-muted-foreground flex items-center gap-2">
            <Link href={`/${locale}/jobs`} className="hover:text-foreground transition-colors">Jobs</Link>
            <span>/</span>
            <span className="text-foreground truncate">{job.title}</span>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 py-6 sm:py-8">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8 lg:items-start">
            {/* Main content */}
            <div className="lg:col-span-2 space-y-8">
              {/* Header */}
              <div>
                <div className="flex items-start justify-between gap-4 mb-3">
                  <h1 className="text-2xl font-semibold text-foreground">{job.title}</h1>
                  {employer?.domainVerified && (
                    <span className="shrink-0 text-xs bg-green-500/10 text-green-600 px-2 py-1 rounded-full font-medium">✓ Verified</span>
                  )}
                </div>

                <p className="text-base text-muted-foreground font-medium mb-4">{employer?.companyName}</p>

                <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" />
                    {job.location?.isRemote ? "Remote" : `${job.location?.city}, ${job.location?.country}`}
                  </span>
                  {salary && (
                    <span className="flex items-center gap-1.5">
                      <span>💰</span>
                      {salary}
                    </span>
                  )}
                  {job.requirements?.experienceMin != null && (
                    <span className="flex items-center gap-1.5">
                      <Briefcase className="h-4 w-4" />
                      {job.requirements.experienceMin}–{job.requirements.experienceMax ?? "+"} years experience
                    </span>
                  )}
                  {job.vacancies > 1 && (
                    <span className="flex items-center gap-1.5">
                      <Users className="h-4 w-4" />
                      {job.vacancies} openings
                    </span>
                  )}
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4" />
                    Posted {timeAgo(job.createdAt)}
                  </span>
                  {daysLeft !== null && daysLeft <= 14 && (
                    <span className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                      daysLeft <= 7
                        ? "bg-orange-500/10 text-orange-600"
                        : "bg-yellow-500/10 text-yellow-600"
                    }`}>
                      Closes in {daysLeft} day{daysLeft === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
              </div>

              {/* Description */}
              <div>
                <h2 className="text-base font-semibold text-foreground mb-3">Job Description</h2>
                <div className="space-y-2">
                  {renderJobDescription(job.description ?? "")}
                </div>
              </div>

              {/* Requirements */}
              {job.requirements && (
                <div className="space-y-4">
                  <h2 className="text-base font-semibold text-foreground">Requirements</h2>

                  {job.requirements.skills?.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-foreground mb-2">Skills</p>
                      <div className="flex flex-wrap gap-2">
                        {job.requirements.skills.map((s: string) => (
                          <span key={s} className="text-sm bg-muted px-3 py-1 rounded-lg text-muted-foreground">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {job.requirements.education && (
                    <div>
                      <p className="text-sm font-medium text-foreground mb-1">Education</p>
                      <p className="text-sm text-muted-foreground">{job.requirements.education}</p>
                    </div>
                  )}

                  {job.requirements.languages?.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-foreground mb-2">Languages</p>
                      <div className="flex flex-wrap gap-2">
                        {job.requirements.languages.map((l: string) => (
                          <span key={l} className="text-sm bg-muted px-3 py-1 rounded-lg text-muted-foreground flex items-center gap-1">
                            <Globe className="h-3 w-3" /> {l}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tags */}
              {job.tags?.length > 0 && (
                <div>
                  <h2 className="text-base font-semibold text-foreground mb-3">Tags</h2>
                  <div className="flex flex-wrap gap-2">
                    {job.tags.map((t: string) => (
                      <Link
                        key={t}
                        href={`/${locale}/jobs?search=${encodeURIComponent(t)}`}
                        className="text-xs bg-primary/10 text-primary px-3 py-1 rounded-full hover:bg-primary/20 transition-colors"
                      >
                        {t}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-4 lg:self-start">
              {/* Apply card */}
              <div className="bg-card border border-border rounded-xl p-5 lg:sticky lg:top-6">
                <div className="mb-4">
                  <p className="text-sm font-semibold text-foreground">{job.title}</p>
                  <p className="text-xs text-muted-foreground">{employer?.companyName}</p>
                </div>

                <EasyApply jobId={String(job._id)} jobTitle={job.title} locale={locale} />

                <p className="text-xs text-muted-foreground text-center mt-3">
                  Your profile is auto-attached to the application.
                </p>
              </div>

              {/* Employer info */}
              <div className="bg-card border border-border rounded-xl p-5 space-y-3">
                <h3 className="text-sm font-semibold text-foreground">About the employer</h3>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">{employer?.companyName}</p>
                  {employer?.industry && <p>Industry: {employer.industry}</p>}
                  {employer?.country && (
                    <p className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5" />
                      {employer.city ? `${employer.city}, ` : ""}{employer.country}
                    </p>
                  )}
                  {employer?.website && (
                    <a
                      href={employer.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-primary hover:underline"
                    >
                      <Globe className="h-3.5 w-3.5" /> Website
                    </a>
                  )}
                  {responseTimeDays && (
                    <p className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
                      <Clock className="h-3.5 w-3.5" />
                      Typically responds within {responseTimeDays} day{responseTimeDays > 1 ? "s" : ""}
                    </p>
                  )}
                </div>
              </div>

              {/* Back link */}
              <Link href={`/${locale}/jobs`} className="block text-center text-sm text-muted-foreground hover:text-foreground transition-colors">
                ← Back to all jobs
              </Link>

              {/* Similar Jobs */}
              <SimilarJobs jobId={String(job._id)} locale={locale} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
