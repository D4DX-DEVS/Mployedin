import { requireRole } from "@/lib/auth/requireRole";

export default async function JobSeekerLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await requireRole(locale, ["job_seeker", "admin"]);
  return (
    <div className="w-full min-w-0">
      <div className="job-seeker-route-content">
        {children}
      </div>
    </div>
  );
}
