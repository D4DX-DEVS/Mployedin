import type { UserRole } from "@/types/user";
import type { NavItem } from "./menuConfig";
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
}

/**
 * Single source of truth for each workspace's phone bottom tab bar
 * (WorkspaceBottomNav). The Sidebar drawer reads the same hrefs to hide
 * these destinations on mobile and avoid showing them twice.
 */
export const WORKSPACE_BOTTOM_NAV_TABS: Partial<Record<UserRole, BottomNavTabConfig[]>> = {
  employer: [
    { key: "dashboard", href: "/employer", icon: "LayoutDashboard", labelKey: "dashboard", exact: true },
    { key: "jobs", href: "/employer/jobs", icon: "Briefcase", labelKey: "jobs" },
    { key: "applications", href: "/employer/applications", icon: "FileText", labelKey: "applications" },
    { key: "interviews", href: "/employer/interviews", icon: "Calendar", labelKey: "interviews" },
  ],
  admin: [
    { key: "dashboard", href: "/admin", icon: "LayoutDashboard", labelKey: "dashboard", exact: true },
    { key: "jobs", href: "/admin/jobs", icon: "Briefcase", labelKey: "jobs" },
    { key: "users", href: "/admin/users", icon: "Users", labelKey: "users" },
    { key: "reports", href: "/admin/reports", icon: "BarChart2", labelKey: "reports" },
  ],
  agent: [
    { key: "dashboard", href: "/agent", icon: "LayoutDashboard", labelKey: "dashboard", exact: true },
    { key: "jobs", href: "/agent/jobs", icon: "Briefcase", labelKey: "jobs" },
    { key: "leads", href: "/agent/leads", icon: "Target", labelKey: "leads" },
    { key: "messages", href: "/agent/messages", icon: "MessageSquare", labelKey: "messages" },
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
 * does not repeat the footer. Only leaf items go — a parent sharing a tab href
 * (agent "Hiring" → /agent/jobs) has to stay for its children.
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
  return items.filter(
    (item) => (item.children?.length ?? 0) > 0 || !tabHrefs.has(item.href.replace(`/${locale}`, ""))
  );
}
