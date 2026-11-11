"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";

interface BottomNavItemBaseProps {
  label: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  active?: boolean;
  /** Count bubble pinned to the icon pill's top corner; hidden at zero. */
  badgeCount?: number;
  /**
   * One id per bar: the highlight pill is a shared-layout element, so with the
   * same id across a bar's tabs it glides from the old tab to the new one.
   */
  indicatorId: string;
}

interface BottomNavLinkProps extends BottomNavItemBaseProps {
  href: string;
  onClick?: never;
  expanded?: never;
  controls?: never;
}

interface BottomNavButtonProps extends BottomNavItemBaseProps {
  href?: never;
  onClick: () => void;
  expanded?: boolean;
  controls?: string;
}

export type BottomNavItemProps = BottomNavLinkProps | BottomNavButtonProps;

const ITEM_CLASS =
  "group relative flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 outline-none [-webkit-tap-highlight-color:transparent]";

/**
 * One tab of a phone bottom bar (workspace roles and job seeker alike):
 * icon inside a pill that fills in when the tab is current, label under it.
 * The pill — not a thin rule along the bar's edge — carries the active state,
 * so it reads at a glance and gives the tap a visible target.
 */
export function BottomNavItem(props: BottomNavItemProps) {
  const { label, icon: Icon, active = false, badgeCount = 0, indicatorId } = props;

  const content = (
    <>
      <span
        className={cn(
          "relative flex h-7 w-14 items-center justify-center rounded-full transition-transform duration-150 group-active:scale-90",
          "group-focus-visible:ring-2 group-focus-visible:ring-primary/50",
          !active && "group-hover:bg-muted"
        )}
      >
        {active && (
          <motion.span
            layoutId={indicatorId}
            aria-hidden
            className="absolute inset-0 rounded-full bg-primary/12"
            initial={false}
            transition={{ type: "spring", stiffness: 500, damping: 38 }}
          />
        )}
        <Icon className="relative size-5 shrink-0" strokeWidth={active ? 2.25 : 1.75} />
        {badgeCount > 0 && (
          <span className="absolute -top-1 end-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground ring-2 ring-background">
            {badgeCount > 9 ? "9+" : badgeCount}
          </span>
        )}
      </span>
      <span
        className={cn(
          "max-w-full truncate text-[11px] leading-none transition-colors",
          active ? "font-semibold" : "font-medium"
        )}
      >
        {label}
      </span>
    </>
  );

  const tone = active ? "text-primary" : "text-muted-foreground";

  if (props.href !== undefined) {
    return (
      <Link
        href={props.href}
        prefetch={false}
        aria-current={active ? "page" : undefined}
        className={cn(ITEM_CLASS, tone)}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-expanded={props.expanded}
      aria-controls={props.controls}
      className={cn(ITEM_CLASS, tone)}
    >
      {content}
    </button>
  );
}

/** Surface shared by every phone bottom bar. */
export const BOTTOM_BAR_CLASS =
  "fixed inset-x-0 bottom-0 border-t border-border/50 bg-background/90 shadow-[0_-8px_24px_-16px_rgba(15,23,42,0.25)] backdrop-blur-xl supports-[backdrop-filter]:bg-background/80 lg:hidden";
