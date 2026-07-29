import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type LabelVisibility = "always" | "responsive" | "tooltip";

interface TableActionLinkProps {
  href: string;
  icon: LucideIcon;
  label: string;
  ariaLabel?: string;
  count?: number;
  labelVisibility?: LabelVisibility;
  className?: string;
  iconClassName?: string;
}

/**
 * Consistent row action:
 * - phone cards show the task label;
 * - compact desktop tables may use the icon with a tooltip;
 * - wide tables restore the visible label.
 */
export function TableActionLink({
  href,
  icon: Icon,
  label,
  ariaLabel = label,
  count,
  labelVisibility = "responsive",
  className,
  iconClassName,
}: TableActionLinkProps) {
  const labelClassName =
    labelVisibility === "always"
      ? "inline"
      : labelVisibility === "tooltip"
        ? "sr-only"
        : "inline sm:sr-only xl:not-sr-only";

  return (
    <Button
      asChild
      variant="ghost"
      size="sm"
      className={cn("h-9 rounded-xl px-2.5", className)}
    >
      <Link
        href={href}
        aria-label={ariaLabel}
        title={label}
        data-table-action=""
      >
        <Icon className={cn("h-4 w-4", iconClassName)} />
        <span className={labelClassName}>{label}</span>
        {typeof count === "number" && (
          <span
            className="min-w-5 rounded-full bg-secondary px-1.5 text-center text-xs tabular-nums text-muted-foreground"
            aria-hidden="true"
          >
            {count}
          </span>
        )}
      </Link>
    </Button>
  );
}
