import { redirect } from "next/navigation";

/**
 * Admin task review moved into the one Tasks page (/admin/tasks, "Tasks I
 * gave" tab). Old links and notifications keep working: their filters
 * (?review=awaiting_review …) are carried over.
 */
export default async function AdminAgentTasksPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string") query.set(key, value);
  }
  query.set("tab", "gave");
  redirect(`/${locale}/admin/tasks?${query.toString()}`);
}
