"use client";

import { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePriorityOverflow } from "@/hooks/usePriorityOverflow";

export interface WorkspaceTab {
  key: string;
  label: string;
  /** Shorter label for phones, where three full labels overflow the row. */
  shortLabel?: string;
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

function activeTabKey(tabs: readonly WorkspaceTab[], pathname: string): string | undefined {
  for (const tab of tabs) {
    if (pathname === tab.href) return tab.key;
    if (!tab.exact && pathname.startsWith(`${tab.href}/`)) return tab.key;
  }
  return undefined;
}

/**
 * Section tabs for a workspace (a job, a people list). The row never scrolls
 * sideways and never cuts a label: tabs that do not fit move under a "More"
 * button, and the open tab always stays on the row.
 */
export function WorkspaceTabs({
  tabs,
  ariaLabel,
  activeKey,
  countLabel,
  className = "",
}: Props) {
  const pathname = usePathname();
  const tCommon = useTranslations("common");
  const listRef = useRef<HTMLUListElement>(null);

  const active = activeKey ?? activeTabKey(tabs, pathname);
  const overflow = usePriorityOverflow(listRef, {
    activeIndex: tabs.findIndex((tab) => tab.key === active),
    watch: tabs.map((tab) => `${tab.label}:${tab.count ?? ""}`).join("|"),
  });
  const overflowTabs = overflow.map((index) => tabs[index]).filter(Boolean);

  return (
    <nav aria-label={ariaLabel}>
      <ul ref={listRef} role="list" className={`workspace-tabs ${className}`}>
        {tabs.map((tab, index) => {
          const isActive = active === tab.key;
          const Icon = tab.icon;
          const tabCountLabel = countLabel && tab.count ? countLabel(tab.label, tab.count) : undefined;

          return (
            <li
              key={tab.key}
              data-overflow-item=""
              data-overflowed={overflow.includes(index) ? "true" : undefined}
              className={tab.hideOnPhone ? "hidden sm:inline-flex" : undefined}
            >
              <Link
                href={tab.href}
                className="workspace-tab"
                aria-current={isActive ? "page" : undefined}
                aria-label={tabCountLabel}
              >
                {Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
                {tab.shortLabel ? (
                  <>
                    <span className="sm:hidden">{tab.shortLabel}</span>
                    <span className="max-sm:hidden">{tab.label}</span>
                  </>
                ) : (
                  <span>{tab.label}</span>
                )}
                {tab.count !== undefined && (
                  <span className="workspace-tab-count">{tab.count}</span>
                )}
              </Link>
            </li>
          );
        })}
        {/* Always rendered so its width can be measured; parked out of sight
            (and out of the tab order) until a tab actually overflows. */}
        <li data-overflow-more="" data-overflowed={overflowTabs.length === 0 ? "true" : undefined}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="workspace-tab">
                <span>{tCommon("more")}</span>
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {overflowTabs.map((tab) => (
                <DropdownMenuItem key={tab.key} asChild className="min-h-11 sm:min-h-9">
                  <Link href={tab.href} aria-label={countLabel && tab.count ? countLabel(tab.label, tab.count) : undefined}>
                    {tab.icon ? <tab.icon className="h-4 w-4" aria-hidden="true" /> : null}
                    <span className="min-w-0 flex-1 truncate">{tab.label}</span>
                    {tab.count !== undefined && <span className="workspace-tab-count">{tab.count}</span>}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </li>
      </ul>
    </nav>
  );
}
