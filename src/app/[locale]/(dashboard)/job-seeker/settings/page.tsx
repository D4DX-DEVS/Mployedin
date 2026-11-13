import { redirect } from "next/navigation";

/**
 * Settings is one page with a tab per route (notifications, privacy,
 * interviews, account, plan). This bare URL — the avatar menu, the profile
 * header and old bookmarks — opens the first tab, and the old `?tab=` values
 * land on the tab that now holds what they used to show.
 */
const TAB_ROUTES: Record<string, string> = {
  interviews: "interviews",
  profile: "account",
  notifications: "notifications",
  privacy: "privacy",
  account: "account",
};

export default async function JobSeekerSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { locale } = await params;
  const { tab } = await searchParams;
  redirect(`/${locale}/job-seeker/settings/${TAB_ROUTES[tab ?? ""] ?? "notifications"}`);
}
