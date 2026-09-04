import { redirect } from "next/navigation";

/**
 * Legacy route. This page ran its own keyword search against
 * `/api/jobs/search?nl=true` — an endpoint that never existed — and fell back
 * to the same endpoint the job feed already uses, with no filters, sort,
 * pagination or save. The feed's search mode is now the only search surface;
 * this redirect keeps old bookmarks and links working.
 */
export default async function JobSeekerSearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { locale } = await params;
  const { q } = await searchParams;
  const query = q?.trim();
  redirect(
    `/${locale}/job-seeker/jobs${query ? `?search=${encodeURIComponent(query)}` : ""}`
  );
}
