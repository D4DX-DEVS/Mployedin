"use client";

import type { LucideIcon } from "lucide-react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface PhoneAction {
  key: string;
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  disabled?: boolean;
  /** Shown instead of `label` while the action runs ("Scoring 3 of 12"). */
  busyLabel?: string;
}

interface PhoneActionsMenuProps {
  /** Trigger text, e.g. "Actions". Always visible: never an icon alone. */
  label: string;
  actions: readonly PhoneAction[];
  className?: string;
}

/**
 * Phones only (hidden from `sm`): several worded buttons that cannot share one
 * row are folded into a single labelled menu, so no label is ever squeezed or
 * cut. From 640px the page renders its own buttons side by side.
 */
export function PhoneActionsMenu({ label, actions, className }: PhoneActionsMenuProps) {
  if (actions.length === 0) return null;
  const busy = actions.find((action) => action.busyLabel);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn("min-h-11 min-w-0 flex-1 justify-between gap-2 rounded-xl px-3 text-sm font-medium sm:hidden", className)}
        >
          <span className="truncate">{busy?.busyLabel ?? label}</span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(18rem,calc(100vw-2rem))]">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <DropdownMenuItem
              key={action.key}
              disabled={action.disabled}
              onSelect={action.onSelect}
              className="min-h-11 gap-2 text-sm"
            >
              {Icon ? <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}
              {action.busyLabel ?? action.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
