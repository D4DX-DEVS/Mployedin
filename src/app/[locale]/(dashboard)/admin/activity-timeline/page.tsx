import { redirect } from "next/navigation";

/**
 * Activity Timeline and Audit Logs read the same `AuditLog` collection through
 * two different endpoints, and neither filter set contained the other: this
 * page had the actor-name search and role filter, the other had resource,
 * action, country and a date range. Answering "everything this user did last
 * week" therefore needed both pages. Audit Logs now carries all six filters, so
 * this route redirects there and existing links keep working.
 */
export default async function AdminActivityTimelinePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/admin/audit-logs`);
}
