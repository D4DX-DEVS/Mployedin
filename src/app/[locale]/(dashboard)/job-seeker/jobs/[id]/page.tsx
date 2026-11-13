import { connectDB } from "@/lib/db/mongoose";
import Job from "@/models/Job";
import { maskJobEmployer } from "@/lib/jobs/companyDisclosure";
import { Employer } from "@/models/Employer";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MapPin, Briefcase, Clock, Users, Globe, Banknote } from "lucide-react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getTranslations } from "next-intl/server";
import EasyApply, { type EasyApplyScreeningQuestion } from "@/components/features/public/EasyApply";
import TrackJobView from "@/components/features/public/TrackJobView";
import { SimilarJobs } from "@/components/features/job-seeker/SimilarJobs";
import { JobMatchCard } from "@/components/features/job-seeker/skills/JobMatchCard";
import { JobMatchBanner } from "@/components/features/job-seeker/skills/JobMatchBanner";
import RelativeDate from "@/components/shared/RelativeDate";
import { ShareJob } from "@/components/shared/ShareJob";
import { SaveJobButton } from "@/components/features/job-seeker/saved/SaveJobButton";
import { serializeJsonLd } from "@/lib/security/jsonLd";
import { formatCount } from "@/lib/ui/intlFormat";
import { closesInDays, isPastClosingDate } from "@/lib/jobs/expiry";

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

interface PopulatedEmployer {
  _id?: string;
  companyName?: string;
  /** Only set on a hidden company: the Mployedin mark (maskJobEmployer). */
  logo?: string;
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

  const employer = maskJobEmployer(job as Record<string, unknown>).employerId as PopulatedEmployer | null;
  const title = `${job.title} at ${employer?.companyName ?? "Company"}`;

  return {
    title,
    description: job.description?.slice(0, 160),
    openGraph: { title, description: job.description?.slice(0, 160), type: "website" },
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

function renderJobDescription(text: string) {
  return (
    <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ ...props }) => <h3 className="heading-subsection mt-4 mb-1.5 font-semibold text-foreground" {...props} />,
          h2: ({ ...props }) => <h3 className="heading-label mt-4 mb-1.5 font-semibold text-foreground" {...props} />,
          h3: ({ ...props }) => <h3 className="heading-label mt-4 mb-1.5 font-semibold text-foreground" {...props} />,
          p: ({ ...props }) => <p className="leading-relaxed" {...props} />,
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
  // Phone-only labels reuse existing strings from sibling namespaces.
  const tCard = await getTranslations("jobCard");
  const tAgentJobs = await getTranslations("agentJobs");
  const tFeed = await getTranslations("jobFeed.sidebar");
  const tPrefs = await getTranslations("jobSeekerExtra.preferences");
  const tEasyApply = await getTranslations("easyApply");
  // Employers store an industry key ("human_resources"); print its label.
  const tIndustry = await getTranslations("employerRegister.industries");
  const industryName = (key: string) => (tIndustry.has(key) ? tIndustry(key) : key.replace(/_/g, " "));

  await connectDB();
  const job = await Job.findById(id)
    .populate("employerId", "companyName country industry city website domainVerified isAgentVerified")
    .lean()
    .catch(() => null);

  if (!job) notFound();

  if (job.status !== "active" || isPastClosingDate(job.expiresAt as Date | null)) {
    // Job exists but is a draft, paused, closed or expired — show a friendly
    // page instead of a raw 404 (metadata above already resolves). Past its
    // closing date counts as closed even before the expiry cron runs.
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 px-4 py-24 text-center">
        <h1 className="text-2xl font-semibold">{job.title}</h1>
        <p className="text-muted-foreground">{t("notAvailableClosed")}</p>
        <Link
          href={`/${locale}/job-seeker/jobs`}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          {t("browseOtherJobs")}
        </Link>
      </div>
    );
  }

  // A hidden company shows as "Mployedin": no id (profile link), website or location.
  const employer = maskJobEmployer(job as Record<string, unknown>).employerId as PopulatedEmployer | null;

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
  const verifiedEmployer = Boolean(employer?.domainVerified || employer?.isAgentVerified);

  // Phone header and "Job overview": only facts the job already carries.
  const employmentLabel = job.employmentType ? tCard(`employment.${job.employmentType}` as "employment.full_time") : null;
  const workModeLabel = job.workMode ? tAgentJobs(`workModes.${job.workMode}` as "workModes.onsite") : null;
  const experienceLabel =
    job.requirements?.experienceMin != null
      ? `${job.requirements.experienceMin}–${job.requirements.experienceMax ?? "+"} ${t("yearsExperience")}`
      : null;
  const companyInitials = (employer?.companyName ?? job.title)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w: string) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const overviewFacts: Array<{ label: string; value: string }> = [];
  if (salary) overviewFacts.push({ label: tFeed("salary"), value: salary });
  if (experienceLabel) overviewFacts.push({ label: t("experience"), value: experienceLabel });
  if (employmentLabel) overviewFacts.push({ label: tPrefs("jobType"), value: employmentLabel });
  if (workModeLabel) overviewFacts.push({ label: tAgentJobs("filters.workModeLabel"), value: workModeLabel });

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
          <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3 text-xs text-muted-foreground max-sm:px-0">
            <Link href={`/${locale}/job-seeker/jobs`} className="hover:text-foreground transition-colors">
              {t("jobSearch")}
            </Link>
            <span>/</span>
            <span className="text-foreground truncate">{job.title}</span>
          </div>
        </div>

        <div className="mx-auto max-w-6xl px-4 py-5 max-sm:px-0 max-sm:py-4 sm:py-8">
          <section className="overflow-hidden rounded-2xl sm:rounded-3xl border border-border/60 bg-gradient-to-br from-card via-card to-primary/[0.05] px-4 py-5 shadow-[0_20px_60px_rgba(15,23,42,0.06)] sm:px-8 sm:py-7">
            <div>
              <div>
                <div className="inline-flex rounded-full border border-primary/10 bg-primary/[0.06] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary max-sm:hidden">
                  {t("jobDetail")}
                </div>
                <div className="mt-4 flex flex-col gap-3 max-sm:mt-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    {employer?.logo ? (
                      <div aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-card sm:hidden">
                        <img src={employer.logo} alt="" width={40} height={40} className="size-10 object-contain" />
                      </div>
                    ) : (
                      <div aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-semibold text-primary sm:hidden">
                        {companyInitials}
                      </div>
                    )}
                  <div className="min-w-0">
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground max-sm:text-xl max-sm:leading-7 sm:text-3xl lg:text-[2.25rem]">
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
                    {/* Phones: location · work mode · type · posted as one quiet line. */}
                    <p className="mt-1 text-xs leading-5 text-muted-foreground sm:hidden">
                      {[...new Set([locationLabel, workModeLabel, employmentLabel].filter(Boolean))].join(" · ")}
                      {" · "}
                      <RelativeDate date={job.createdAt} prefix="Posted" />
                    </p>
                  </div>
                  </div>
                  {/* Phones: save and share sit beside Apply below, so this row only
                      shows there for the verified badge. */}
                  <div className={`flex items-center gap-2 shrink-0 ${verifiedEmployer ? "" : "max-sm:hidden"}`}>
                    {verifiedEmployer && (
                      <span className="shrink-0 rounded-full bg-green-500/10 px-3 py-1 text-xs font-medium text-green-600">
                        {t("verifiedEmployer")}
                      </span>
                    )}
                    <SaveJobButton jobId={String(job._id)} className="max-sm:hidden" />
                    <div className="max-sm:hidden">
                      <ShareJob
                        jobId={String(job._id)}
                        jobTitle={job.title}
                        companyName={employer?.companyName ?? "Company"}
                        locale={locale}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-2 text-sm text-muted-foreground max-sm:hidden">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/90 px-3 py-1.5">
                    <MapPin className="h-4 w-4" />
                    {locationLabel}
                  </span>
                  {salary && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/90 px-3 py-1.5">
                      <Banknote className="h-4 w-4" aria-hidden="true" />
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
            <div className="mt-3 space-y-3 sm:hidden">
              <JobMatchBanner jobId={String(job._id)} />
              <div className="flex items-center gap-2">
                <a
                  href="#quick-apply"
                  className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm"
                >
                  {tEasyApply("applyNow")}
                </a>
                <ShareJob
                  variant="icon"
                  jobId={String(job._id)}
                  jobTitle={job.title}
                  companyName={employer?.companyName ?? "Company"}
                  locale={locale}
                  className="min-h-11 w-11 shrink-0 p-0 [&>svg]:size-4"
                />
                <SaveJobButton jobId={String(job._id)} className="w-11 shrink-0 px-0" />
              </div>
            </div>
          </section>

          <div className="mt-5 sm:mt-6 grid gap-5 max-sm:grid-cols-[minmax(0,1fr)] max-sm:gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1.7fr)_320px] lg:grid-rows-[auto_1fr]">
            <div className="space-y-5 sm:space-y-6 lg:col-start-1 lg:row-start-1 lg:self-start">
              {overviewFacts.length > 0 && (
                <section className="card-base rounded-xl panel-body sm:hidden">
                  <h2 className="heading-section font-semibold tracking-tight text-foreground">
                    {t.has("jobOverview") ? t("jobOverview") : t("overview")}
                  </h2>
                  <dl className="mt-3 divide-y divide-border/60">
                    {overviewFacts.map((fact) => (
                      <div key={fact.label} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                        <dt className="text-muted-foreground">{fact.label}</dt>
                        <dd className="text-end font-medium text-foreground">{fact.value}</dd>
                      </div>
                    ))}
                    <div className="flex items-baseline justify-between gap-3 py-2 text-sm">
                      <dt className="text-muted-foreground">{tAgentJobs("table.posted")}</dt>
                      <dd className="text-end font-medium text-foreground"><RelativeDate date={job.createdAt} /></dd>
                    </div>
                  </dl>
                </section>
              )}
              <section className="card-base rounded-xl sm:rounded-3xl panel-body">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{t("overview")}</div>
                <h2 className="heading-section mt-1 font-semibold tracking-tight text-foreground">{t("whatThisRoleCovers")}</h2>
                <div className="mt-4 space-y-2">
                  {renderJobDescription(job.description ?? "")}
                </div>
              </section>

              {/* Responsibilities */}
              {job.responsibilities?.length > 0 && (
                <section className="card-base rounded-xl sm:rounded-3xl panel-body">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{t("responsibilities")}</div>
                  <h2 className="heading-section mt-1 font-semibold tracking-tight text-foreground">{t("whatYouWillDo")}</h2>
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
                <section className="card-base rounded-xl sm:rounded-3xl panel-body">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{t("qualifications")}</div>
                  <h2 className="heading-section mt-1 font-semibold tracking-tight text-foreground">{t("whatWereLookingFor")}</h2>
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
                <section className="card-base rounded-xl sm:rounded-3xl panel-body">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{t("benefits")}</div>
                  <h2 className="heading-section mt-1 font-semibold tracking-tight text-foreground">{t("whatYouWillGet")}</h2>
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
                <section className="card-base rounded-xl sm:rounded-3xl panel-body">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{t("learning")}</div>
                  <h2 className="heading-section mt-1 font-semibold tracking-tight text-foreground">{t("whatYouWillLearn")}</h2>
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

              {/* The list's match percentage, what it is made of, and each of the
                  job's skills, languages and licences with Has / Missing. The
                  skills used to be listed twice more below ("Profile insights"
                  and the chips in this section); the card now carries them, and
                  shows them as plain chips when the seeker has no score yet. */}
              <JobMatchCard
                jobId={String(job._id)}
                asked={{
                  skills: job.requirements?.skills ?? [],
                  preferredSkills: job.requirements?.preferredSkills ?? [],
                }}
              />

              {job.requirements && (
                <section className="card-base rounded-xl sm:rounded-3xl panel-body">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{t("requirements")}</div>
                  <h2 className="heading-section mt-1 font-semibold tracking-tight text-foreground">{t("whatTheEmployerIsLookingFor")}</h2>

                  <div className="mt-5 space-y-5">
                    <div>
                      <p className="mb-1 text-sm font-medium text-foreground">{t("experience")}</p>
                      <p className="text-sm text-muted-foreground">
                        {job.requirements.experienceMin != null
                          ? `${job.requirements.experienceMin}${
                              job.requirements.experienceMax != null
                                ? `–${job.requirements.experienceMax}`
                                : "+"
                            } ${t("yearsExperience")}`
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
                        <p className="text-sm text-muted-foreground">{industryName(employer.industry)}</p>
                      </div>
                    )}

                    {/* Confirmed languages are scored and listed in the match
                        card; only unconfirmed ones (not scored, D14) show here. */}
                    {job.requirements.languages?.length > 0 && !job.requirements.languagesConfirmedAt && (
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
                <section className="card-base rounded-xl sm:rounded-3xl panel-body">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{t("searchTerms")}</div>
                  <h2 className="heading-section mt-1 font-semibold tracking-tight text-foreground">{t("relatedTags")}</h2>
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

            <div className="space-y-4 sm:space-y-5 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:self-start">
              <aside id="quick-apply" className="scroll-mt-20 rounded-xl sm:rounded-3xl border border-border/70 bg-background/95 shadow-[0_16px_40px_rgba(15,23,42,0.07)] panel-body">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{t("quickApply")}</div>
                  <h2 className="heading-section mt-1 font-semibold tracking-tight text-foreground">{t("applyWithYourProfile")}</h2>
                </div>
                <div className="mt-4 space-y-2 rounded-xl sm:rounded-3xl border border-border/60 bg-card text-sm text-muted-foreground card-pad">
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

              <section className="card-base rounded-xl sm:rounded-3xl panel-body">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{t("employerProfile")}</div>
                <h3 className="heading-subsection mt-1 font-semibold tracking-tight text-foreground">{t("aboutTheEmployer")}</h3>
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
                  {employer?.industry && <p>{t("industryLabel")}: {industryName(employer.industry)}</p>}
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
                className="block rounded-xl sm:rounded-3xl border border-border/70 bg-background/90 px-4 py-3 text-center text-sm font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
              >
                {tc("back")} {t("jobSearch")}
              </Link>
            </div>

            {/* Similar Jobs — second row of the content column, so it fills the
                space beside the taller apply rail instead of leaving it blank. */}
            <SimilarJobs
              jobId={String(job._id)}
              locale={locale}
              className="border-t border-border pt-5 lg:col-start-1 lg:row-start-2 lg:self-start lg:border-t-0 lg:pt-0"
            />
          </div>
        </div>
      </div>
    </>
  );
}
