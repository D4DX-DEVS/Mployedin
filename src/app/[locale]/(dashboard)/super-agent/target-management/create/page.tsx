import { redirect } from "next/navigation";

interface SuperAgentCreateTargetPageProps {
  params: Promise<{ locale: string }>;
}

/**
 * Giving targets to agents is one screen: the distribute dialog on the target
 * page, which splits the super agent's own target and enforces its budget.
 * This route (the Create menu and ⌘K still point here) opens that dialog
 * instead of keeping a second, parallel form to maintain.
 */
export default async function SuperAgentCreateTargetPage({ params }: SuperAgentCreateTargetPageProps) {
  const { locale } = await params;
  redirect(`/${locale}/super-agent/target-management?distribute=1`);
}
