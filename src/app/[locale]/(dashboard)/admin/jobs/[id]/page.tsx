import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

/**
 * Admins have no read-only page per job; the editor is it. A link to
 * /admin/jobs/<id> — the job form used to send admins here after Save Draft,
 * which showed "Page not found" (bug report 2026-10-28) — opens the editor.
 */
export default async function AdminJobRoute({ params }: PageProps) {
  const { locale, id } = await params;
  redirect(`/${locale}/admin/jobs/${id}/edit`);
}
