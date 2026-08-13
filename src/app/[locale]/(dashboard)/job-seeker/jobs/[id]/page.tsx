import { connectDB } from "@/lib/db/mongoose";
import Job from "@/models/Job";
import { Employer } from "@/models/Employer";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MapPin, Briefcase, Clock, Users, Globe } from "lucide-react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getTranslations } from "next-intl/server";
import EasyApply, { type EasyApplyScreeningQuestion } from "@/components/features/public/EasyApply";
import TrackJobView from "@/components/features/public/TrackJobView";
import { SimilarJobs } from "@/components/features/job-seeker/SimilarJobs";
import { SkillInsights } from "@/components/features/job-seeker/skills/SkillInsights";
import RelativeDate from "@/components/shared/RelativeDate";
import { ShareJob } from "@/components/shared/ShareJob";
import { serializeJsonLd } from "@/lib/security/jsonLd";

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

interface PopulatedEmployer {
  _id?: string;
  companyName?: string;
  country?: string;
  industry?: string;
  city?: string;
  website?: string;
  domainVerified?: boolean;
  isAgentVerified?: boolean;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  await connectDB();
  const job = await Job.findById(id)
    .populate("employerId", "companyName")
    .lean()
    .catch(() => null);

  if (!job) return { title: "Job Not Found" };

  // The page body and GET /api/jobs/[id] both hide non-active jobs from seekers.
  // Metadata is generated before those checks, so without this a guessed ID
  // still leaked a draft/pending job's title and description via the tab title
  // and OpenGraph tags.
  if (job.status !== "active") return { title: "Job Not Found" };

  const employer = job.employerId as PopulatedEmployer | null;
  const title = `${job.title} at ${employer?.companyName ?? "Company"}`;

  return {
    title,
    description: job.description?.slice(0, 160),
    openGraph: { title, description: job.description?.slice(0, 160), type: "website" },
  };
}



function closesInDays(expiresAt?: Date | null): number | null {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt).getTime() - Date.now();
  const days = Math.ceil(diff / 86400000);
  return days > 0 ? days : null;
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
      min: salary.min.toLocaleString(),
      max: salary.max.toLocaleString(),
    });
  if (salary.min)
    return t("fromSalaryPerMonth", { currency: salary.currency ?? "AED", min: salary.min.toLocaleString() });
  return null;
}

function renderJobDescription(text: string) {
  return (
    <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ ...props }) => <h3 className="mt-4 mb-1.5 text-base font-semibold text-foreground" {...props} />,
          h2: ({ ...props }) => <h3 className="mt-4 mb-1.5 text-sm font-semibold text-foreground" {...props} />,
          h3: ({ ...props }) => <h3 className="mt-4 mb-1.5 text-sm font-semibold text-foreground" {...props} />,
          p: ({ ...props }) => <p className="leading-relaxed text-justify" {...props} />,
          ul: ({ ...props }) => <ul className="list-disc space-y-1 ps-5" {...props} />,
          ol: ({ ...props }) => <ol className="list-decimal space-y-1 ps-5" {...props} />,
          li: ({ ...props }) => <li className="leading-relaxed" {...props} />,
          strong: ({ ...props }) => <strong className="font-semibold text-foreground" {...props} />,
          em: ({ ...props }) => <em className="italic" {...props} />,
          a: ({ ...props }) => (
            <a
              className="text-primary underline underline-offset-2 hover:text-primary/80"
              target="_blank"
              rel="noopener noreferrer"
              {...props}
            />
          ),
          hr: () => <hr className="my-4 border-border/60" />,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

export default async function DashboardJobDetailPage({ params }: PageProps) {
  const { locale, id } = await params;
  const t = await getTranslations("jobSeekerJobDetail");
  const tc = await getTranslations("common");

  await connectDB();
  const job = await Job.findById(id)
    .populate("employerId", "companyName country industry city website domainVerified isAgentVerified")
    .lean()
    .catch(() => null);

  if (!job) notFound();

  if (job.status !== "active") {
    // Job exists but is under review, paused, closed or expired — show a
    // friendly page instead of a raw 404 (metadata above already resolves).
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 px-4 py-24 text-center">
        <h1 className="text-2xl font-semibold">{job.title}</h1>
        <p className="text-muted-foreground">
          {job.status === "pending_approval"
            ? t("notAvailablePending")
            : t("notAvailableClosed")}
        </p>
        <Link
          href={`/${locale}/job-seeker/jobs`}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          {t("browseOtherJobs")}
        </Link>
      </div>
    );
  }

  const employer = job.employerId as PopulatedEmployer | null;

  let responseTimeDays: number | null = null;
  if (employer?._id) {
    const emp = await Employer.findById(employer._id)
      .select("responseTimeCommitment")
      .lean();
    responseTimeDays = (emp as unknown as { responseTimeCommitment?: number })?.responseTimeCommitment ?? null;
  }

  const salary = job.showSalary !== false ? salaryLabel(job.salary as Parameters<typeof salaryLabel>[0], t) : null;
  const daysLeft = closesInDays(job.expiresAt as Date | null);
  const locationLabel = job.location?.isRemote
    ? t("remote")
    : [job.location?.city, job.location?.country].filter(Boolean).join(", ") || "Location flexible";
  const employerLocation = [employer?.city, employer?.country].filter(Boolean).join(", ");

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
        // nosemgrep: typescript.react.security.audit.react-dangerouslysetinnerhtml.react-dangerouslysetinnerhtml -- JSON-LD escaped by serializeJsonLd
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <TrackJobView jobId={String(job._id)} />

      <div className="min-h-screen bg-background">
        <div className="border-b border-border bg-muted/20">
          <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3 text-xs text-muted-foreground">
            <Link href={`/${locale}/job-seeker/jobs`} className="hover:text-foreground transition-colors">
              {t("jobSearch")}
            </Link>
            <span>/</span>
            <span className="text-foreground truncate">{job.title}</span>
          </div>
        </div>

        <div className="mx-auto max-w-6xl px-4 py-5 sm:py-8">
          <section className="overflow-hidden rounded-2xl sm:rounded-[30px] border border-border/60 bg-gradient-to-br from-card via-card to-primary/[0.05] px-4 py-5 shadow-[0_20px_60px_rgba(15,23,42,0.06)] sm:px-8 sm:py-7">
            <div>
              <div>
                <div className="inline-flex rounded-full border border-primary/10 bg-primary/[0.06] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                  {t("jobDetail")}
                </div>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl lg:text-[2.25rem]">
                      {job.title}
                    </h1>
                    {employer?._id ? (
                      <Link
                        href={`/${locale}/job-seeker/companies/${String(employer._id)}`}
                        className="mt-2 inline-flex text-sm sm:text-base font-medium text-muted-foreground transition-colors hover:text-primary"
                      >
                        {employer.companyName}
                      </Link>
                    ) : (
                      <p className="mt-2 text-sm sm:text-base font-medium text-muted-foreground">{employer?.companyName}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {(employer?.domainVerified || employer?.isAgentVerified) && (
                      <span className="shrink-0 rounded-full bg-green-500/10 px-3 py-1 text-xs font-medium text-green-600">
                        {t("verifiedEmployer")}
                      </span>
                    )}
                    <ShareJob
                      jobId={String(job._id)}
                      jobTitle={job.title}
                      companyName={employer?.companyName ?? "Company"}
                      locale={locale}
                    />
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-2 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/90 px-3 py-1.5">
                    <MapPin className="h-4 w-4" />
                    {locationLabel}
                  </span>
                  {salary && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/90 px-3 py-1.5">
                      <span>💰</span>
                      {salary}
                    </span>
                  )}
                  {job.requirements?.experienceMin != null && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/90 px-3 py-1.5">
                      <Briefcase className="h-4 w-4" />
                      {job.requirements.experienceMin}–{job.requirements.experienceMax ?? "+"} {t("yearsExperience")}
                    </span>
                  )}
                  {(job.vacancies ?? 0) > 1 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/90 px-3 py-1.5">
                      <Users className="h-4 w-4" />
                      {job.vacancies} {t("openings")}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/90 px-3 py-1.5">
                    <Clock className="h-4 w-4" />
                    <RelativeDate date={job.createdAt} prefix="Posted" />
                  </span>
                  {daysLeft !== null && daysLeft <= 14 && (
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium ${
                        daysLeft <= 7
                          ? "bg-orange-500/10 text-orange-600"
                          : "bg-yellow-500/10 text-yellow-700"
                      }`}
                    >
                      {daysLeft === 1 ? t("closesInDay") : t("closesInDays", { count: daysLeft })}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </section>

          <div className="mt-5 sm:mt-6 grid gap-5 sm:gap-6 lg:grid-cols-[minmax(0,1.7fr)_320px]">
            <div className="space-y-5 sm:space-y-6">
              <section className="card-base rounded-xl sm:rounded-[28px] p-4 sm:p-6">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{t("overview")}</div>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">{t("whatThisRoleCovers")}</h2>
                <div className="mt-4 space-y-2">
                  {renderJobDescription(job.description ?? "")}
                </div>
              </section>

              {/* Responsibilities */}
              {job.responsibilities?.length > 0 && (
                <section className="card-base rounded-xl sm:rounded-[28px] p-4 sm:p-6">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{t("responsibilities")}</div>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">{t("whatYouWillDo")}</h2>
                  <ul className="mt-4 space-y-2">
                    {job.responsibilities.map((r: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary/60 shrink-0" />
                        {r}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Qualifications */}
              {job.qualifications?.length > 0 && (
                <section className="card-base rounded-xl sm:rounded-[28px] p-4 sm:p-6">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{t("qualifications")}</div>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">{t("whatWereLookingFor")}</h2>
                  <ul className="mt-4 space-y-2">
                    {job.qualifications.map((q: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500/60 shrink-0" />
                        {q}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Benefits */}
              {job.benefits?.length > 0 && (
                <section className="card-base rounded-xl sm:rounded-[28px] p-4 sm:p-6">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{t("benefits")}</div>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">{t("whatYouWillGet")}</h2>
                  <ul className="mt-4 space-y-2">
                    {job.benefits.map((b: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-500/60 shrink-0" />
                        {b}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Learning Outcomes */}
              {job.learningOutcomes?.length > 0 && (
                <section className="card-base rounded-xl sm:rounded-[28px] p-4 sm:p-6">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{t("learning")}</div>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">{t("whatYouWillLearn")}</h2>
                  <ul className="mt-4 space-y-2">
                    {job.learningOutcomes.map((l: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-violet-500/60 shrink-0" />
                        {l}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Profile Insights — skill matching + micro questions */}
              <SkillInsights jobId={String(job._id)} source="job_view" />

              {job.requirements && (
                <section className="card-base rounded-xl sm:rounded-[28px] p-4 sm:p-6">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{t("requirements")}</div>
                  <h2 className="mt-1 text-lg sm:text-xl font-semibold tracking-tight text-foreground">{t("whatTheEmployerIsLookingFor")}</h2>

                  <div className="mt-5 space-y-5">
                    {job.requirements.skills?.length > 0 && (
                      <div>
                        <p className="mb-2 text-sm font-medium text-foreground">{t("skills")}</p>
                        <div className="flex flex-wrap gap-2">
                          {job.requirements.skills.map((s: string) => (
                            <span key={s} className="rounded-full border border-border/60 bg-muted/20 px-3 py-1 text-sm text-muted-foreground">
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <p className="mb-1 text-sm font-medium text-foreground">{t("experience")}</p>
                      <p className="text-sm text-muted-foreground">
                        {job.requirements.experienceMin != null
                          ? `${job.requirements.experienceMin}${
                              job.requirements.experienceMax != null
                                ? `–${job.requirements.experienceMax}`
                                : "+"
                            } ${t("experience")}`
                          : t("notSpecified")}
                      </p>
                    </div>

                    {job.requirements.education && (
                      <div>
                        <p className="mb-1 text-sm font-medium text-foreground">{t("education")}</p>
                        <p className="text-sm text-muted-foreground">{job.requirements.education}</p>
                      </div>
                    )}

                    {employer?.industry && (
                      <div>
                        <p className="mb-1 text-sm font-medium text-foreground">{t("industry")}</p>
                        <p className="text-sm text-muted-foreground">{employer.industry}</p>
                      </div>
                    )}

                    {job.requirements.languages?.length > 0 && (
                      <div>
                        <p className="mb-2 text-sm font-medium text-foreground">{t("languages")}</p>
                        <div className="flex flex-wrap gap-2">
                          {job.requirements.languages.map((l: string) => (
                            <span
                              key={l}
                              className="flex items-center gap-1 rounded-full border border-border/60 bg-muted/20 px-3 py-1 text-sm text-muted-foreground"
                            >
                              <Globe className="h-3 w-3" /> {l}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {job.tags?.length > 0 && (
                <section className="card-base rounded-xl sm:rounded-[28px] p-4 sm:p-6">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{t("searchTerms")}</div>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">{t("relatedTags")}</h2>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {job.tags.map((t: string) => (
                      <Link
                        key={t}
                        href={`/${locale}/job-seeker/jobs?search=${encodeURIComponent(t)}`}
                        className="rounded-full bg-primary/10 px-3 py-1 text-xs text-primary transition-colors hover:bg-primary/20"
                      >
                        {t}
                      </Link>
                    ))}
                  </div>
                </section>
              )}
            </div>

            <div className="space-y-4 sm:space-y-5 lg:self-start">
              <aside className="rounded-xl sm:rounded-[26px] border border-border/70 bg-background/95 p-4 sm:p-5 shadow-[0_16px_40px_rgba(15,23,42,0.07)]">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{t("quickApply")}</div>
                  <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">{t("applyWithYourProfile")}</h2>
                </div>
                <div className="mt-4 space-y-2 rounded-xl sm:rounded-[22px] border border-border/60 bg-card px-4 py-4 text-sm text-muted-foreground">
                  <p>{t("useYourSavedProfile")}</p>
                  {responseTimeDays ? (
                    <p className="font-medium text-green-600">
                      {responseTimeDays === 1 ? t("typicallyRespondsWithinDay") : t("typicallyRespondsWithinDays", { count: responseTimeDays })}
                    </p>
                  ) : null}
                </div>
                <div className="mt-4">
                  <EasyApply
                    jobId={String(job._id)}
                    jobTitle={job.title}
                    locale={locale}
                    screeningQuestions={(job as Record<string, unknown>).screeningQuestions as EasyApplyScreeningQuestion[] | undefined}
                  />
                </div>
              </aside>

              <section className="card-base rounded-xl sm:rounded-[28px] p-4 sm:p-5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{t("employerProfile")}</div>
                <h3 className="mt-1 text-lg font-semibold tracking-tight text-foreground">{t("aboutTheEmployer")}</h3>
                <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                  {employer?._id ? (
                    <Link
                      href={`/${locale}/job-seeker/companies/${String(employer._id)}`}
                      className="font-medium text-foreground transition-colors hover:text-primary"
                    >
                      {employer.companyName}
                    </Link>
                  ) : (
                    <p className="font-medium text-foreground">{employer?.companyName}</p>
                  )}
                  {employer?.industry && <p>{t("industryLabel")}: {employer.industry}</p>}
                  {employerLocation && (
                    <p className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5" />
                      {employerLocation}
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
                </div>
                {employer?._id ? (
                  <Link
                    href={`/${locale}/job-seeker/companies/${String(employer._id)}`}
                    className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary transition-colors hover:text-primary/80"
                  >
                    {t("viewCompanyProfile")}
                  </Link>
                ) : null}
              </section>

              <Link
                href={`/${locale}/job-seeker/jobs`}
                className="block rounded-xl sm:rounded-[22px] border border-border/70 bg-background/90 px-4 py-3 text-center text-sm font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
              >
                {tc("back")} {t("jobSearch")}
              </Link>
            </div>
          </div>

          {/* Similar Jobs - full width below */}
          <SimilarJobs jobId={String(job._id)} locale={locale} />
        </div>
      </div>
    </>
  );
}
