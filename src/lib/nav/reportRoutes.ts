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
