import { requireRole } from "@/lib/auth/requireRole";
import { SeekerAreaPrompt } from "@/components/features/job-seeker/SeekerAreaPrompt";

export default async function JobSeekerLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await requireRole(locale, ["job_seeker", "admin"]);
  return (
    <div className="w-full min-w-0">
      <div className="job-seeker-route-content">
        {children}
      </div>
      {/* Seekers only — an admin viewing these pages has no area of their own. */}
      {(session.user as { role?: string }).role === "job_seeker" && <SeekerAreaPrompt />}
    </div>
  );
}
