import { connectDB } from "@/lib/db/mongoose";
import Job from "@/models/Job";
import { HIDDEN_COMPANY_LOGO, isCompanyHidden, maskJobEmployer } from "@/lib/jobs/companyDisclosure";
import { Employer } from "@/models/Employer";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { MapPin, Briefcase, Building2, Clock, Users, Globe, Banknote, Check, Home, ChevronRight, FileText, ListChecks, GraduationCap, Gift, Lightbulb, ClipboardCheck, Tag, Info, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import EasyApply, { type EasyApplyScreeningQuestion } from "@/components/features/public/EasyApply";
import TrackJobView from "@/components/features/public/TrackJobView";
import SocialShare from "@/components/features/public/SocialShare";
import { SimilarJobs } from "@/components/features/job-seeker/SimilarJobs";
import { StickyApplyBar } from "@/components/features/public/StickyApplyBar";
import RelativeDate from "@/components/shared/RelativeDate";
import { MarkdownRenderer } from "@/components/shared/MarkdownRenderer";
import { serializeJsonLd } from "@/lib/security/jsonLd";
import { formatCount } from "@/lib/ui/intlFormat";
import { getLocalizedCountryName } from "@/lib/i18n/locations";
import { closesInDays, isPastClosingDate } from "@/lib/jobs/expiry";

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://mployedin-8a4rc.ondigitalocean.app";

function SectionHeading({ icon: Icon, children, className = "mb-3" }: { icon: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <h2 className={`flex items-center gap-2.5 heading-section font-semibold text-foreground ${className}`}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden="true">
        <Icon className="h-4 w-4" />
      </span>
      {children}
    </h2>
  );
}

function BulletSection({ title, items, dotClass, icon }: { title: string; items?: string[]; dotClass: string; icon: LucideIcon }) {
  if (!items?.length) return null;
  return (
    <div className="bg-card border border-border rounded-xl panel-body">
      <SectionHeading icon={icon}>{title}</SectionHeading>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
            <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${dotClass}`} aria-hidden="true" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, id } = await params;
  await connectDB();
  const job = await Job.findById(id)
    .populate("employerId", "companyName")
    .lean()
    .catch(() => null);

  if (!job) return { title: "Job Not Found" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const employer = maskJobEmployer(job as Record<string, unknown>).employerId as any;
  // Site name is appended by the root layout's title template ("%s | MPLOYEDIN").
  const title = `${job.title} at ${employer?.companyName ?? "Company"}`;
  const description = job.description?.slice(0, 160);
  const ogImageUrl = `${BASE_URL}/api/og/job?id=${id}`;
  const canonicalUrl = `${BASE_URL}/${locale}/jobs/${id}`;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
      languages: {
        en: `${BASE_URL}/en/jobs/${id}`,
        ar: `${BASE_URL}/ar/jobs/${id}`,
        "x-default": `${BASE_URL}/en/jobs/${id}`,
      },
    },
    openGraph: {
      title,
      description,
      type: "website",
      url: canonicalUrl,
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
    },
  };
}




function salaryLabel(
  salary: { min?: number; max?: number; currency?: string; isNegotiable?: boolean } | null,
  t: Awaited<ReturnType<typeof getTranslations>>
) {
  if (!salary) return null;
  if (salary.isNegotiable) return t("negotiable");
  if (salary.min && salary.max)
    return t("salaryRangePerMonth", {
      currency: salary.currency ?? "AED",
      min: formatCount(salary.min),
      max: formatCount(salary.max),
    });
  if (salary.min)
    return t("fromSalaryPerMonth", { currency: salary.currency ?? "AED", min: formatCount(salary.min) });
  return null;
}

export default async function JobDetailPage({ params }: PageProps) {
  const { locale, id } = await params;
  const t = await getTranslations("publicJobDetail");
  // Employers store the industry as a key ("human_resources"); the register
  // form's list holds its label.
  const tIndustry = await getTranslations("employerRegister.industries");

  await connectDB();
  const job = await Job.findById(id)
    .populate("employerId", "companyName country industry city website domainVerified isAgentVerified")
    .lean()
    .catch(() => null);

  // Past its closing date is closed even before the expiry cron flips the status.
  if (!job || job.status !== "active" || isPastClosingDate(job.expiresAt as Date | null)) notFound();

   
  const companyHidden = isCompanyHidden(job as { discloseCompany?: boolean });
  // A hidden company shows as "Mployedin" with no website, location, industry or badges.
  const employer = maskJobEmployer(job as Record<string, unknown>).employerId as any;

  // Fetch employer response-time commitment for display
  let responseTimeDays: number | null = null;
  if (employer?._id && !companyHidden) {
    const emp = await Employer.findById(employer._id)
      .select("responseTimeCommitment")
      .lean();
    responseTimeDays = (emp as unknown as { responseTimeCommitment?: number })?.responseTimeCommitment ?? null;
  }
  // Arabic pages use the Arabic copy of a list when the employer wrote one.
  const localizedList = (en?: string[], ar?: string[]) =>
    (locale === "ar" && ar?.length ? ar : en)?.filter((s) => s?.trim()) ?? [];
  const salary = job.showSalary !== false ?salaryLabel(job.salary as Parameters<typeof salaryLabel>[0], t) : null;
  const daysLeft = closesInDays(job.expiresAt as Date | null);

  // Map internal employment type values to schema.org equivalents
  const employmentTypeMap: Record<string, string> = {
    full_time: "FULL_TIME",
    part_time: "PART_TIME",
    contract: "CONTRACTOR",
    internship: "INTERN",
    freelance: "CONTRACTOR",
    walk_in: "OTHER",
  };

  // JSON-LD structured data for Google Jobs
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description: job.description ?? "",
    url: `${BASE_URL}/${locale}/jobs/${String(job._id)}`,
    datePosted: job.createdAt instanceof Date ? job.createdAt.toISOString() : String(job.createdAt),
    hiringOrganization: {
      "@type": "Organization",
      name: employer?.companyName ?? "Company",
      ...(employer?.website ? { sameAs: employer.website } : {}),
    },
    jobLocation: job.location?.isRemote
      ? { "@type": "Place", address: { "@type": "PostalAddress", addressCountry: job.location?.country ?? "" } }
      : {
          "@type": "Place",
          address: {
            "@type": "PostalAddress",
            addressLocality: job.location?.city ?? "",
            addressCountry: job.location?.country ?? "",
          },
        },
    ...(job.location?.isRemote && { jobLocationType: "TELECOMMUTE" }),
    ...(job.expiresAt ? { validThrough: new Date(job.expiresAt).toISOString() } : {}),
    ...(job.employmentType ? { employmentType: employmentTypeMap[job.employmentType] ?? "OTHER" } : {}),
    ...(job.showSalary !== false && job.salary?.min
      ? {
          baseSalary: {
            "@type": "MonetaryAmount",
            currency: job.salary.currency ?? "AED",
            value: {
              "@type": "QuantitativeValue",
              minValue: job.salary.min,
              ...(job.salary.max ? { maxValue: job.salary.max } : {}),
              unitText: "MONTH",
            },
          },
        }
      : {}),
    identifier: {
      "@type": "PropertyValue",
      name: "mployedin",
      value: String(job._id),
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        // nosemgrep: typescript.react.security.audit.react-dangerouslysetinnerhtml.react-dangerouslysetinnerhtml -- JSON-LD escaped by serializeJsonLd
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <TrackJobView jobId={String(job._id)} />

      <div className="min-h-screen bg-gradient-to-b from-primary/[0.04] via-background to-background">
        {/* Breadcrumb */}
        <div className="border-b border-border/60 bg-background/60">
          <div className="max-w-6xl mx-auto px-4 py-3 text-xs text-muted-foreground flex items-center gap-2">
            <Link href={`/${locale}/jobs`} className="flex items-center gap-1.5 hover:text-foreground transition-colors">
              <Home className="h-3.5 w-3.5" aria-hidden="true" />
              {t("jobSearch")}
            </Link>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 rtl:rotate-180" aria-hidden="true" />
            <span className="text-foreground truncate">{job.title}</span>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 py-4 sm:py-6 md:py-8 pb-24 lg:pb-8">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-8 lg:items-start">
            {/* Main content */}
            <div className="min-w-0 space-y-5 sm:space-y-6">
              {/* Header */}
              <div className="bg-card border border-border rounded-xl panel-body">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4 mb-3">
                  <div className="flex min-w-0 items-start gap-3">
                    {companyHidden ? (
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-card" aria-hidden="true">
                        <img src={HIDDEN_COMPANY_LOGO} alt="" width={40} height={40} className="size-10 object-contain" />
                      </span>
                    ) : (
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden="true">
                        <Building2 className="h-6 w-6" />
                      </span>
                    )}
                    <div className="min-w-0">
                      <h1 className="text-xl sm:text-2xl font-semibold text-foreground">{job.title}</h1>
                      <p className="mt-0.5 text-base text-muted-foreground font-medium">{employer?.companyName}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <SocialShare
                      url={`${BASE_URL}/${locale}/jobs/${String(job._id)}`}
                      title={`${job.title} at ${employer?.companyName ?? "Company"}`}
                      description={job.description?.slice(0, 120)}
                    />
                    {(employer?.domainVerified || employer?.isAgentVerified) && (
                      <span className="inline-flex items-center gap-1 text-xs bg-green-500/10 text-green-800 px-2 py-1 rounded-full font-medium"><Check className="h-3 w-3" aria-hidden="true" />{t("verifiedBadge")}</span>
                    )}
                  </div>
                </div>


                <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" />
                    {job.location?.isRemote ? t("remote") : [job.location?.city, job.location?.country].filter(Boolean).join(", ")}
                  </span>
                  {salary && (
                    <span className="flex items-center gap-1.5">
                      <Banknote className="h-4 w-4" aria-hidden="true" />
                      {salary}
                    </span>
                  )}
                  {job.requirements?.experienceMin != null && (
                    <span className="flex items-center gap-1.5">
                      <Briefcase className="h-4 w-4" />
                      {job.requirements.experienceMin}–{job.requirements.experienceMax ?? "+"} {t("yearsExperience")}
                    </span>
                  )}
                  {(job.employmentType || job.workMode) && (
                    <span className="flex items-center gap-1.5">
                      <Building2 className="h-4 w-4" aria-hidden="true" />
                      {[
                        job.employmentType && t.has(`employmentTypes.${job.employmentType}`) ? t(`employmentTypes.${job.employmentType}`) : null,
                        job.workMode && t.has(`workModes.${job.workMode}`) ? t(`workModes.${job.workMode}`) : null,
                      ].filter(Boolean).join(" · ")}
                    </span>
                  )}
                  {job.vacancies > 1 && (
                    <span className="flex items-center gap-1.5">
                      <Users className="h-4 w-4" />
                      {job.vacancies} {t("openings")}
                    </span>
                  )}
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4" />
                    <RelativeDate date={job.createdAt} prefix="Posted" />
                  </span>
                  {daysLeft !== null && daysLeft <= 14 && (
                    <span className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                      daysLeft <= 7
                        ? "bg-orange-500/10 text-orange-800"
                        : "bg-yellow-500/10 text-yellow-800"
                    }`}>
                      {daysLeft === 1 ? t("closesInDay") : t("closesInDays", { count: daysLeft })}
                    </span>
                  )}
                </div>
              </div>

              {/* Description */}
              <div className="bg-card border border-border rounded-xl panel-body">
                <SectionHeading icon={FileText}>{t("jobDescription")}</SectionHeading>
                <MarkdownRenderer content={job.description ?? ""} />
              </div>

              {/* The lists the job form collects. Qualifications is where the
                  employer writes the degree or course a candidate needs. */}
              <BulletSection title={t("responsibilities")} items={localizedList(job.responsibilities, job.responsibilitiesAr)} dotClass="bg-primary" icon={ListChecks} />
              <BulletSection title={t("qualifications")} items={localizedList(job.qualifications, job.qualificationsAr)} dotClass="bg-emerald-500" icon={GraduationCap} />
              <BulletSection title={t("benefits")} items={localizedList(job.benefits, job.benefitsAr)} dotClass="bg-amber-500" icon={Gift} />
              <BulletSection title={t("learningOutcomes")} items={job.learningOutcomes} dotClass="bg-violet-500" icon={Lightbulb} />

              {/* Requirements — hidden entirely when every sub-field is empty */}
              {job.requirements && (job.requirements.skills?.length > 0 || job.requirements.preferredSkills?.length > 0 || job.requirements.education || job.requirements.languages?.length > 0) && (
                <div className="bg-card border border-border rounded-xl space-y-4 panel-body">
                  <SectionHeading icon={ClipboardCheck} className="">{t("requirements")}</SectionHeading>

                  {job.requirements.skills?.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-foreground mb-2">{t("skills")}</p>
                      <div className="flex flex-wrap gap-2">
                        {job.requirements.skills.map((s: string) => (
                          <span key={s} className="text-sm bg-muted px-3 py-1 rounded-lg text-muted-foreground">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {job.requirements.preferredSkills?.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-foreground mb-2">{t("niceToHave")}</p>
                      <div className="flex flex-wrap gap-2">
                        {job.requirements.preferredSkills.map((s: string) => (
                          <span key={s} className="text-sm border border-dashed border-border px-3 py-1 rounded-lg text-muted-foreground">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {job.requirements.education && (
                    <div>
                      <p className="text-sm font-medium text-foreground mb-1">{t("education")}</p>
                      <p className="text-sm text-muted-foreground">{job.requirements.education}</p>
                    </div>
                  )}

                  {job.requirements.languages?.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-foreground mb-2">{t("languages")}</p>
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
              {job.tags?.filter((tag: string) => !/^seed-/i.test(tag)).length > 0 && (
                <div className="bg-card border border-border rounded-xl panel-body">
                  <SectionHeading icon={Tag}>{t("tags")}</SectionHeading>
                  <div className="flex flex-wrap gap-2">
                    {job.tags.filter((t: string) => !/^seed-/i.test(t)).map((t: string) => (
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
              <div id="apply" className="bg-card border border-border rounded-2xl p-3 sm:p-4 shadow-sm">

                <EasyApply
                  jobId={String(job._id)}
                  jobTitle={job.title}
                  locale={locale}
                  screeningQuestions={(job as Record<string, unknown>).screeningQuestions as EasyApplyScreeningQuestion[] | undefined}
                />

                <p className="mt-3 flex items-start justify-center gap-1.5 text-xs text-muted-foreground">
                  <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {t("autoAttachedProfile")}
                </p>
              </div>

              {/* Employer info */}
              <div className="bg-card border border-border rounded-xl space-y-3 panel-body">
                <h3 className="flex items-center gap-2.5 heading-label font-semibold text-foreground">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden="true">
                    <Building2 className="h-4 w-4" />
                  </span>
                  {t("aboutTheEmployer")}
                </h3>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">{employer?.companyName}</p>
                  {employer?.industry && (
                    <p>
                      {t("industry")}:{" "}
                      {tIndustry.has(employer.industry) ? tIndustry(employer.industry) : employer.industry.replace(/_/g, " ")}
                    </p>
                  )}
                  {employer?.country && (
                    <p className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5" />
                      {employer.city ? `${employer.city}, ` : ""}{getLocalizedCountryName(employer.country, locale)}
                    </p>
                  )}
                  {employer?.website && (
                    <a
                      href={employer.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-primary hover:underline"
                    >
                      <Globe className="h-3.5 w-3.5" /> {t("website")}
                    </a>
                  )}
                  {responseTimeDays && (
                    <p className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
                      <Clock className="h-3.5 w-3.5" />
                      {responseTimeDays === 1 ? t("typicallyRespondsWithinDay") : t("typicallyRespondsWithinDays", { count: responseTimeDays })}
                    </p>
                  )}
                </div>
              </div>

              {/* Back link */}
              <Link href={`/${locale}/jobs`} className="block text-center text-sm text-muted-foreground hover:text-foreground transition-colors">
                {t("backToAllJobs")}
              </Link>
            </div>
          </div>

          {/* Similar Jobs - full width below */}
          <SimilarJobs jobId={String(job._id)} locale={locale} isPublic />
        </div>
      </div>

      <StickyApplyBar targetId="apply" jobTitle={job.title} salaryLine={salary ?? undefined} />
    </>
  );
}
