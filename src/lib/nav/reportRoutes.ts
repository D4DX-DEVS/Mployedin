/**
 * The admin report set: one sidebar row ("Reports"), one tab strip across the
 * five pages. Both read this list, so a report added to the strip also lights
 * the sidebar row — before, only /admin/reports did and the other four pages
 * highlighted "Dashboard".
 */
export const ADMIN_REPORT_TABS = [
  { key: "platform", path: "/admin/reports" },
  { key: "aiInsights", path: "/admin/analytics" },
  { key: "targets", path: "/admin/target-report" },
  { key: "commissions", path: "/admin/commissions-report" },
  { key: "subscriptions", path: "/admin/subscription-dashboard" },
] as const;

/**
 * The super-agent report set, built the same way: one "Reports" row in the
 * sidebar, this strip on each page. The four used to be separate leaves inside
 * a fourteen-entry "Overview" group, next to an Insights page that only
 * repeated the alerts the Agents page already opens as a dialog.
 */
export const SUPER_AGENT_REPORT_TABS = [
  { key: "team", path: "/super-agent/reports" },
  { key: "targets", path: "/super-agent/target-report" },
  { key: "commissions", path: "/super-agent/commissions-report" },
  { key: "market", path: "/super-agent/market" },
] as const;

export interface ReportTab {
  key: string;
  path: string;
}
