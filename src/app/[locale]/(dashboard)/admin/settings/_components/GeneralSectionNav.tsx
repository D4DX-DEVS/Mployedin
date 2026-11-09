"use client";

import { useEffect, useRef } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface GeneralSectionItem<K extends string> {
  key: K;
  label: string;
  description: string;
  icon: LucideIcon;
}

interface GeneralSectionNavProps<K extends string> {
  items: readonly GeneralSectionItem<K>[];
  active: K;
  onSelect: (key: K) => void;
  label: string;
}

/**
 * The General tab's own table of contents. Desktop: a vertical list beside
 * the form, one entry per topic with a one-line hint. Phones: a horizontally
 * scrolling row of pills above the form, labels only.
 */
export function GeneralSectionNav<K extends string>({ items, active, onSelect, label }: GeneralSectionNavProps<K>) {
  const listRef = useRef<HTMLUListElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  // On phones the pill row scrolls sideways; a topic opened from a link must not sit off-screen.
  // Only when the row overflows, so the desktop column never scrolls the page.
  useEffect(() => {
    const list = listRef.current;
    const el = activeRef.current;
    if (!list || !el || list.scrollWidth <= list.clientWidth) return;
    if (typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "nearest", inline: "center" });
  }, [active]);

  return (
    <nav aria-label={label} className="lg:sticky lg:top-4 lg:self-start">
      <ul ref={listRef} className="scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0 lg:pb-0">
        {items.map((item) => {
          const isActive = item.key === active;
          const Icon = item.icon;
          return (
            <li key={item.key} className="shrink-0">
              <button
                ref={isActive ? activeRef : undefined}
                type="button"
                onClick={() => onSelect(item.key)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex w-full min-h-11 items-center gap-2.5 rounded-xl px-3 py-2 text-start text-sm transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block whitespace-nowrap lg:whitespace-normal">{item.label}</span>
                  <span className="hidden text-xs font-normal text-muted-foreground lg:block">{item.description}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
