import Link from "next/link";
import type { ReactNode } from "react";
import { BarChart3, BellRing, LayoutDashboard } from "lucide-react";

export type DashboardTab = "overview" | "attention" | "analysis";

interface AdminDashboardTabsProps {
  activeTab: DashboardTab;
  labels: Record<DashboardTab, string>;
  ariaLabel: string;
  hrefFor: (tab: DashboardTab) => string;
  actions?: ReactNode;
  children: ReactNode;
}

/** URL-driven tabs keep the default dashboard light and make each view shareable. */
export function AdminDashboardTabs({ activeTab, labels, ariaLabel, hrefFor, actions, children }: AdminDashboardTabsProps) {
  const icons = { overview: LayoutDashboard, attention: BellRing, analysis: BarChart3 };

  return (
    <div className="space-y-4" data-admin-dashboard-tabs>
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-border">
        <nav className="reference-tablist min-w-0 flex-1 border-b-0" aria-label={ariaLabel}>
          {(Object.keys(labels) as DashboardTab[]).map((tab) => (
            <Link
              key={tab}
              href={hrefFor(tab)}
              aria-current={activeTab === tab ? "page" : undefined}
              className="reference-tab"
            >
              {(() => { const Icon = icons[tab]; return <Icon className="h-4 w-4" aria-hidden="true" />; })()}
              {labels[tab]}
            </Link>
          ))}
        </nav>
        {actions ? <div className="flex shrink-0 items-center gap-2 pb-1">{actions}</div> : null}
      </div>

      <div aria-label={labels[activeTab]}>
        {children}
      </div>
    </div>
  );
}
