"use client";

import type { MouseEvent } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

// Controls that own their click. A row click that lands on one (the checkbox,
// the status pill, "…", a link) must not also expand the row.
const ROW_CONTROLS =
  "a, button, input, label, select, textarea, [role='button'], [role='checkbox'], [role='combobox'], [contenteditable='true']";

/**
 * True when a click on an expandable row should toggle it: not on a control
 * inside the row, not from a portalled menu (React bubbles portal clicks up
 * the component tree, so a "…" menu item would otherwise toggle the row), and
 * not the end of a text selection (copying an email address).
 */
export function isRowToggleClick(event: MouseEvent<HTMLElement>): boolean {
  const row = event.currentTarget;
  const target = event.target instanceof Element ? event.target : null;
  if (!target || !row.contains(target)) return false;
  const control = target.closest(ROW_CONTROLS);
  if (control && control !== row && row.contains(control)) return false;
  const selection = typeof window === "undefined" ? null : window.getSelection();
  if (selection && selection.toString().trim() && row.contains(selection.anchorNode)) return false;
  return true;
}

interface RowExpandToggleProps {
  expanded: boolean;
  onToggle: () => void;
  className?: string;
}

/**
 * The expandable row's chevron: shows whether the details are open, and is the
 * keyboard way in (the row itself also toggles on click). Replaces a
 * "Show details" item buried in the "…" menu.
 */
export function RowExpandToggle({ expanded, onToggle, className }: RowExpandToggleProps) {
  const t = useTranslations("common");
  const label = expanded ? t("hideDetails") : t("showDetails");
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-label={label}
      title={label}
      data-table-action=""
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        className,
      )}
    >
      <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", expanded && "rotate-180")} aria-hidden="true" />
    </button>
  );
}
