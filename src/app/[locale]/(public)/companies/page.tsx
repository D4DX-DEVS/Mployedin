import { connectDB } from "@/lib/db/mongoose";
import Employer from "@/models/Employer";
import Job from "@/models/Job";
import type { Metadata } from "next";
import Link from "next/link";
import { Building2, MapPin, Users, Briefcase, CheckCircle2 } from "lucide-react";

export const metadata: Metadata = {
  title: "Companies | mployedin",
  description: "Browse top companies hiring on mployedin. Find your next employer.",
};

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; search?: string; industry?: string }>;
}

export default async function PublicCompaniesPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1"));
  const limit = 12;
  const search = sp.search ?? "";
  const industry = sp.industry ?? "";

  await connectDB();

  const filter: Record<string, unknown> = { isActive: true };
  if (search) {
    filter.$or = [
      { companyName: { $regex: search, $options: "i" } },
      { industry: { $regex: search, $options: "i" } },
    ];
  }
  if (industry) {
    filter.industry = { $regex: industry, $options: "i" };
  }

  const [employers, total] = await Promise.all([
    Employer.find(filter)
      .select("companyName logo industry companySize city country description domainVerified")
      .sort({ companyName: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Employer.countDocuments(filter),
  ]);

  const employerIds = employers.map((e: Record<string, unknown>) => e._id);
  const jobCounts = await Job.aggregate([
    { $match: { employerId: { $in: employerIds }, status: "active" } },
    { $group: { _id: "$employerId", count: { $sum: 1 } } },
  ]);
  const jobCountMap = new Map(jobCounts.map((j) => [String(j._id), j.count]));

  const totalPages = Math.ceil(total / limit);

  return (
    <main className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Companies</h1>
        <p className="text-muted-foreground">Discover top employers hiring on mployedin</p>
      </div>

      {/* Search */}
      <form className="flex gap-3 mb-8 flex-wrap">
        <input
          type="text"
          name="search"
          defaultValue={search}
          placeholder="Search companies..."
          className="flex-1 min-w-[200px] px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <input
          type="text"
          name="industry"
          defaultValue={industry}
          placeholder="Filter by industry..."
          className="w-[200px] px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <button type="submit" className="px-6 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors">
          Search
        </button>
      </form>

      {/* Grid */}
      {employers.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Building2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg">No companies found</p>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {employers.map((emp: Record<string, unknown>) => (
            <Link
              key={String(emp._id)}
              href={`/${locale}/companies/${String(emp._id)}`}
              className="group block p-6 bg-card border border-border rounded-xl hover:shadow-md hover:border-primary/30 transition-all"
            >
              <div className="flex items-start gap-4">
                {emp.logo ? (
                  <img src={emp.logo as string} alt="" className="w-14 h-14 rounded-lg object-cover border border-border" />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center">
                    <Building2 className="w-6 h-6 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                      {emp.companyName as string}
                    </h3>
                    {emp.domainVerified ? (
                      <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0" />
                    ) : null}
                  </div>
                  {emp.industry ? (
                    <p className="text-sm text-muted-foreground mt-0.5">{emp.industry as string}</p>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
                {(emp.city || emp.country) ? (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    {[emp.city, emp.country].filter(Boolean).join(", ")}
                  </span>
                ) : null}
                {emp.companySize ? (
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" />
                    {emp.companySize as string}
                  </span>
                ) : null}
                <span className="flex items-center gap-1">
                  <Briefcase className="w-3.5 h-3.5" />
                  {jobCountMap.get(String(emp._id)) ?? 0} open jobs
                </span>
              </div>

              {emp.description ? (
                <p className="mt-3 text-sm text-muted-foreground line-clamp-2">
                  {emp.description as string}
                </p>
              ) : null}
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-8">
          {page > 1 && (
            <Link
              href={`/${locale}/companies?page=${page - 1}${search ? `&search=${search}` : ""}${industry ? `&industry=${industry}` : ""}`}
              className="px-4 py-2 border border-border rounded-lg hover:bg-accent transition-colors"
            >
              Previous
            </Link>
          )}
          <span className="px-4 py-2 text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={`/${locale}/companies?page=${page + 1}${search ? `&search=${search}` : ""}${industry ? `&industry=${industry}` : ""}`}
              className="px-4 py-2 border border-border rounded-lg hover:bg-accent transition-colors"
            >
              Next
            </Link>
          )}
        </div>
      )}
    </main>
  );
}
