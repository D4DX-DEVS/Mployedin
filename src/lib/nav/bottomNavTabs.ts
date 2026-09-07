import type { UserRole } from "@/types/user";
import type { NavItem, NavBadgeKey } from "./menuConfig";
import type { IconName } from "./iconRegistry";

export interface BottomNavTabConfig {
  key: string;
  /** Full path, e.g. "/admin/jobs" — matched against the sidebar's NavItem hrefs. */
  href: string;
  icon: IconName;
  /** Key into the "nav" translation namespace. */
  labelKey: string;
  /** Exact pathname match instead of startsWith — set on the dashboard root tab. */
  exact?: boolean;
  /**
   * Live counter painted on this tab. Counts whose destination IS a visible tab
   * belong here; the "More" tab only carries the counts whose destination is
   * hidden behind it. Before this, every count landed on "More" — so employer
   * and agent saw the unread badge on the drawer while the Messages tab beside
   * it sat blank.
   */
  badgeKey?: NavBadgeKey;
}

/**
 * Single source of truth for each workspace's phone bottom tab bar
 * (WorkspaceBottomNav). The Sidebar drawer reads the same hrefs to hide
 * these destinations on mobile and avoid showing them twice.
 */
export const WORKSPACE_BOTTOM_NAV_TABS: Partial<Record<UserRole, BottomNavTabConfig[]>> = {
  // Three tabs, not four. With "More" and the raised Create control the bar was
  // six slots wide, which pushed Create a third of a tab right of centre and
  // left every label cramped. Messages moved up to the header, where it is one
  // tap and carries its own unread badge.
  employer: [
    { key: "dashboard", href: "/employer", icon: "LayoutDashboard", labelKey: "home", exact: true },
    { key: "jobs", href: "/employer/jobs", icon: "Briefcase", labelKey: "jobs" },
    // Labelled for the page it opens, not the sidebar group it mirrors: the tab
    // lands on Applications, and "Hiring" over an "Applications" header read as
    // the wrong destination.
    { key: "hiring", href: "/employer/applications", icon: "FileText", labelKey: "applications" },
  ],
  // Three tabs, for the same reason employer has three: a fourth pushed the bar
  // to six slots, shoved the raised Create control right of centre and cramped
  // every label.
  //
  // The three mirror the admin rail's own top level — Dashboard, then the two
  // registries an admin administers. Applications and Inbox moved behind
  // "More": Applications is a *child* of Recruitment, so promoting it taught a
  // different hierarchy than the rail, and the unread and support-ticket counts
  // are not lost — with no tab owning them they roll up onto the "More" badge
  // (menuBadgeCount in DashboardShell).
  admin: [
    { key: "dashboard", href: "/admin", icon: "LayoutDashboard", labelKey: "dashboard", exact: true },
    { key: "jobs", href: "/admin/jobs", icon: "Briefcase", labelKey: "jobs" },
    { key: "users", href: "/admin/users", icon: "Users", labelKey: "users" },
  ],
  agent: [
    { key: "dashboard", href: "/agent", icon: "LayoutDashboard", labelKey: "dashboard", exact: true },
    { key: "jobs", href: "/agent/jobs", icon: "Briefcase", labelKey: "jobs" },
    { key: "leads", href: "/agent/leads", icon: "Target", labelKey: "leads", badgeKey: "dueFollowUps" },
    { key: "messages", href: "/agent/messages", icon: "MessageSquare", labelKey: "messages", badgeKey: "unreadMessages" },
  ],
  job_seeker: [
    { key: "home", href: "/job-seeker", icon: "LayoutDashboard", labelKey: "home", exact: true },
    { key: "jobs", href: "/job-seeker/jobs", icon: "Briefcase", labelKey: "jobs" },
    { key: "applications", href: "/job-seeker/applications", icon: "FileText", labelKey: "applications" },
    { key: "profile", href: "/job-seeker/profile", icon: "UserCircle", labelKey: "profile" },
  ],
  super_agent: [
    { key: "dashboard", href: "/super-agent", icon: "LayoutDashboard", labelKey: "dashboard", exact: true },
    { key: "agents", href: "/super-agent/agents", icon: "Users", labelKey: "agents" },
    { key: "leads", href: "/super-agent/leads", icon: "Target", labelKey: "leads" },
    { key: "commissions", href: "/super-agent/commissions", icon: "DollarSign", labelKey: "commissions" },
  ],
};

/**
 * Drops the destinations the phone bottom tab bar already links, so the drawer
 * does not repeat the footer. Applies at every depth: super-agent's "Team" and
 * "Finance" groups re-listed Agents, Leads and Commissions as children right
 * above the tab bar that already links them. A leaf whose href a tab covers
 * goes; a parent survives only while it still has children left (or its own
 * href is not tab-linked) — a group left empty by the pruning adds nothing the
 * footer doesn't already provide.
 */
export function withoutBottomTabItems(
  items: NavItem[],
  role: string | undefined,
  locale: string
): NavItem[] {
  const tabHrefs = new Set(
    (WORKSPACE_BOTTOM_NAV_TABS[role as UserRole] ?? []).map((tab) => tab.href)
  );
  if (!tabHrefs.size) return items;
  const linkedByTab = (item: NavItem) => tabHrefs.has(item.href.replace(`/${locale}`, ""));
  const prune = (list: NavItem[]): NavItem[] =>
    list
      .map((item) =>
        item.children?.length ? { ...item, children: prune(item.children) } : item
      )
      .filter((item) => (item.children?.length ?? 0) > 0 || !linkedByTab(item));
  return prune(items);
}
