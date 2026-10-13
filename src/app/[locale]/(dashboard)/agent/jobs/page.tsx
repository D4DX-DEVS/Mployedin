import { redirect } from "next/navigation";
import { AgentJobsWorkspace } from "./_components/AgentJobsWorkspace";

/** The agent's own jobs. The portal-wide list moved to /agent/browse-jobs. */
export default async function AgentJobsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  // Old "All active jobs" tab links (?view=all) land on the browse page with
  // their filters intact.
  if (query.view === "all") {
    const rest = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (key === "view" || value === undefined) continue;
      for (const v of Array.isArray(value) ? value : [value]) rest.append(key, v);
    }
    const qs = rest.toString();
    redirect(`/${locale}/agent/browse-jobs${qs ? `?${qs}` : ""}`);
  }
  return <AgentJobsWorkspace mode="my" />;
}
