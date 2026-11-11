"use client";

import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface LabelledControlProps {
  /** Visible name of the control ("Year", "Status"). */
  label: string;
  /** Renders the control. Put `id` on the element that takes focus (SelectTrigger, input). */
  children: (id: string) => ReactNode;
  /** Wrapper: sizing and placement in the parent row. */
  className?: string;
}

/*
 * Visible labels for pickers that showed only their value ("2026", "All
 * statuses", "Last 30 days"), so nothing on screen said what they changed
 * (WCAG 3.3.2 / 1.3.1). The label is a real <label for>, so it also names the
 * control for screen readers.
 */

/** Label beside the control on the same line: page headers and toolbars where a label above would add a row. */
export function InlineLabelled({ label, children, className }: LabelledControlProps) {
  const id = useId();
  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <label htmlFor={id} className="shrink-0 whitespace-nowrap text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children(id)}
    </div>
  );
}

/**
 * Label above the control, matching SearchField and InlineFilterSearch. Rows
 * that mix this with unlabelled buttons should align items to the end so the
 * boxes sit level.
 */
export function StackedLabelled({ label, children, className }: LabelledControlProps) {
  const id = useId();
  return (
    <div className={cn("min-w-0", className)}>
      <label htmlFor={id} className="mb-1 block truncate text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children(id)}
    </div>
  );
}
