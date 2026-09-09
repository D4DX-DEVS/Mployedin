"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";

export interface WorkspaceTab {
  key: string;
  label: string;
  href: string;
  count?: number;
  icon?: LucideIcon;
  hideOnPhone?: boolean;
  exact?: boolean;
}

interface Props {
  tabs: readonly WorkspaceTab[];
  ariaLabel: string;
  activeKey?: string;
  countLabel?: (tab: string, count: number) => string;
  className?: string;
}

export function WorkspaceTabs({
  tabs,
  ariaLabel,
  activeKey,
  countLabel,
  className = "",
}: Props) {
  const pathname = usePathname();
  const activeTabRef = useRef<HTMLAnchorElement>(null);

  // Determine which tab is active
  const getActiveKey = () => {
    if (activeKey) return activeKey;

    // Match based on pathname
    for (const tab of tabs) {
      if (tab.exact) {
        if (pathname === tab.href) return tab.key;
      } else {
        if (pathname === tab.href || pathname.startsWith(tab.href + "/")) {
          return tab.key;
        }
      }
    }
    return undefined;
  };

  const active = getActiveKey();

  // Scroll active tab into view on mount
  useEffect(() => {
    if (activeTabRef.current && typeof activeTabRef.current.scrollIntoView === "function") {
      activeTabRef.current.scrollIntoView({ block: "nearest", inline: "center" });
    }
  }, [active]);

  return (
    <nav aria-label={ariaLabel}>
      <ul role="list" className={`workspace-tabs ${className}`}>
        {tabs.map((tab) => {
          const isActive = active === tab.key;
          const Icon = tab.icon;
          const tabCountLabel = countLabel && tab.count ? countLabel(tab.label, tab.count) : undefined;

          return (
            <li
              key={tab.key}
              className={tab.hideOnPhone ? "hidden sm:inline-flex" : undefined}
            >
              <Link
                ref={isActive ? activeTabRef : null}
                href={tab.href}
                className="workspace-tab"
                aria-current={isActive ? "page" : undefined}
                aria-label={tabCountLabel}
              >
                {Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span className="workspace-tab-count">{tab.count}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
