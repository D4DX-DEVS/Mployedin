import { redirect } from "next/navigation";

/**
 * One lead has one detail surface: the Lead Workspace, docked beside the
 * pipeline (2026-10-02).
 *
 * This route used to be a separate page with its own stage rail, which moved
 * a lead without asking for any of the stage's details, and a timeline that
 * printed raw action names. It now opens the workspace on the board, so old
 * links and bookmarks land on the same view as a card click.
 */
export default async function LeadDetailRedirect({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  redirect(`/${locale}/agent/leads?lead=${encodeURIComponent(id)}`);
}
