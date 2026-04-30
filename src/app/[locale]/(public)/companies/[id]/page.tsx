import { connectDB } from "@/lib/db/mongoose";
import Employer from "@/models/Employer";
import Job from "@/models/Job";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { Building2, MapPin, Globe, Users, Briefcase, CheckCircle2, Calendar, ExternalLink } from "lucide-react";
import RelativeDate from "@/components/shared/RelativeDate";
import CompanyReviews from "@/components/features/public/CompanyReviews";

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  await connectDB();
  const emp = await Employer.findById(id).select("companyName description industry").lean().catch(() => null);
  if (!emp) return { title: "Company Not Found | mployedin" };
  const title = `${(emp as Record<string, unknown>).companyName} | mployedin`;
  const description = ((emp as Record<string, unknown>).description as string)?.slice(0, 160) ?? `View ${(emp as Record<string, unknown>).companyName} profile and open jobs on mployedin`;
  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
  };
}

export default async function PublicCompanyDetailPage({ params }: PageProps) {
  const { locale, id } = await params;
  await connectDB();

  const emp = await Employer.findOne({ _id: id, isActive: true })
    .select("companyName logo description website industry companySize foundedYear city country address domainVerified socialLinks")
    .lean()
    .catch(() => null);

  if (!emp) notFound();

  const employer = emp as Record<string, unknown>;
  const socialLinks = employer.socialLinks as Record<string, string> | undefined;

  const jobs = await Job.find({ employerId: id, status: "active", deletedAt: null })
    .select("title location salary requirements employmentType workMode createdAt")
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  const jobCount = await Job.countDocuments({ employerId: id, status: "active", deletedAt: null });

  return (
    <main className="container mx-auto px-4 py-8 max-w-5xl">
      {/* Company Header */}
      <div className="bg-card border border-border rounded-xl p-6 md:p-8 mb-8">
        <div className="flex items-start gap-6">
          {employer.logo ? (
            <img src={employer.logo as string} alt="" className="w-20 h-20 rounded-xl object-cover border border-border" />
          ) : (
            <div className="w-20 h-20 rounded-xl bg-muted flex items-center justify-center">
              <Building2 className="w-8 h-8 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-foreground">{employer.companyName as string}</h1>
              {employer.domainVerified ? (
                <CheckCircle2 className="w-5 h-5 text-blue-500" />
              ) : null}
            </div>
            {employer.industry ? (
              <p className="text-muted-foreground mt-1">{employer.industry as string}</p>
            ) : null}
            <div className="flex flex-wrap gap-4 mt-3 text-sm text-muted-foreground">
              {(employer.city || employer.country) ? (
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4" />
                  {[employer.city, employer.country].filter(Boolean).join(", ")}
                </span>
              ) : null}
              {employer.companySize ? (
                <span className="flex items-center gap-1.5">
                  <Users className="w-4 h-4" />
                  {employer.companySize as string} employees
                </span>
              ) : null}
              {employer.foundedYear ? (
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" />
                  Founded {employer.foundedYear as number}
                </span>
              ) : null}
              {employer.website ? (
                <a href={employer.website as string} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-primary hover:underline">
                  <Globe className="w-4 h-4" />
                  Website
                </a>
              ) : null}
            </div>
          </div>
        </div>

        {employer.description ? (
          <div className="mt-6 pt-6 border-t border-border">
            <h2 className="font-semibold text-foreground mb-2">About</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{employer.description as string}</p>
          </div>
        ) : null}

        {/* Social Links */}
        {socialLinks && Object.values(socialLinks).some(Boolean) && (
          <div className="mt-4 flex gap-3">
            {socialLinks.linkedin && (
              <a href={socialLinks.linkedin} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>
        )}
      </div>

      {/* Open Jobs */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Briefcase className="w-5 h-5" />
            Open Positions ({jobCount})
          </h2>
        </div>

        {jobs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground bg-card border border-border rounded-xl">
            <Briefcase className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p>No open positions at the moment</p>
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map((job: Record<string, unknown>) => {
              const loc = job.location as Record<string, unknown> | undefined;
              const sal = job.salary as Record<string, unknown> | undefined;
              return (
                <Link
                  key={String(job._id)}
                  href={`/${locale}/jobs/${String(job._id)}`}
                  className="block p-4 bg-card border border-border rounded-xl hover:shadow-sm hover:border-primary/30 transition-all"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-medium text-foreground hover:text-primary transition-colors">
                        {job.title as string}
                      </h3>
                      <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                        {loc && (loc.city || loc.country) ? (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5" />
                            {[loc.city, loc.country].filter(Boolean).join(", ")}
                          </span>
                        ) : null}
                        {job.employmentType ? (
                          <span className="px-2 py-0.5 bg-muted rounded text-xs">
                            {(job.employmentType as string).replace("_", " ")}
                          </span>
                        ) : null}
                        {job.workMode ? (
                          <span className="px-2 py-0.5 bg-muted rounded text-xs capitalize">
                            {job.workMode as string}
                          </span>
                        ) : null}
                        {sal && (sal.min || sal.max) ? (
                          <span className="text-green-600 dark:text-green-400">
                            {(sal.currency as string) ?? "AED"} {sal.min ? Number(sal.min).toLocaleString() : ""}{sal.max ? ` – ${Number(sal.max).toLocaleString()}` : ""}/mo
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                      <RelativeDate date={job.createdAt as string} />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Back to Companies */}
      <CompanyReviews employerId={id} companyName={employer.companyName as string} />

      <div className="mt-8 text-center">
        <Link href={`/${locale}/companies`} className="text-primary hover:underline text-sm">
          ← Back to all companies
        </Link>
      </div>
    </main>
  );
}
