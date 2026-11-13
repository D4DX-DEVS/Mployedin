"use client";

import { useRef } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePriorityOverflow } from "@/hooks/usePriorityOverflow";
import { cn } from "@/lib/utils";

export interface OverflowTabItem<K extends string> {
  key: K;
  label: string;
  icon?: LucideIcon;
}

interface OverflowTabsProps<K extends string> {
  items: readonly OverflowTabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  /** Names the group for screen readers ("Template type", "Settings section"). */
  ariaLabel: string;
  className?: string;
}

const CHIP =
  "inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9";
const CHIP_ON = "bg-primary text-primary-foreground";
const CHIP_OFF = "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground";

/**
 * One row of in-page section chips (template type, analytics view, settings
 * section). The row never scrolls sideways and never cuts a label: chips that
 * do not fit move under a "More" chip, and the chosen one always stays on the
 * row. For tabs that are links between pages, use WorkspaceTabs instead.
 */
export function OverflowTabs<K extends string>({ items, value, onChange, ariaLabel, className }: OverflowTabsProps<K>) {
  const tCommon = useTranslations("common");
  const listRef = useRef<HTMLDivElement>(null);
  const overflow = usePriorityOverflow(listRef, {
    activeIndex: items.findIndex((item) => item.key === value),
    watch: items.map((item) => item.label).join("|"),
  });
  const overflowItems = overflow.map((index) => items[index]).filter(Boolean);

  return (
    <div ref={listRef} role="group" aria-label={ariaLabel} className={cn("relative flex gap-2 overflow-x-clip", className)}>
      {items.map((item, index) => {
        const Icon = item.icon;
        const active = item.key === value;
        return (
          <button
            key={item.key}
            type="button"
            data-overflow-item=""
            data-overflowed={overflow.includes(index) ? "true" : undefined}
            aria-pressed={active}
            onClick={() => onChange(item.key)}
            className={cn(CHIP, active ? CHIP_ON : CHIP_OFF)}
          >
            {Icon ? <Icon className="size-4 shrink-0" aria-hidden="true" /> : null}
            {item.label}
          </button>
        );
      })}
      {/* Always rendered so its width can be measured; parked out of sight
          (and out of the tab order) until a chip actually overflows. */}
      <div data-overflow-more="" data-overflowed={overflowItems.length === 0 ? "true" : undefined} className="shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={cn(CHIP, CHIP_OFF)}>
              {tCommon("more")}
              <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuRadioGroup value={value} onValueChange={(next) => onChange(next as K)}>
              {overflowItems.map((item) => (
                <DropdownMenuRadioItem key={item.key} value={item.key} className="min-h-11 sm:min-h-9">
                  {item.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
