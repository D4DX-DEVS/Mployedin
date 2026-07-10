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
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
        {children}
      </div>
    </div>
  );
}
