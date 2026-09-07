"use client";

import { AlertTriangle, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  /** What failed to load, e.g. "Commissions". Falls back to a generic title. */
  title?: string;
  /** One sentence on what to do next. Falls back to the shared retry copy. */
  description?: string;
  /** Refetch. Omit only when there is genuinely nothing to retry. */
  onRetry?: () => void;
  /** Label for the retry button. Defaults to the shared "Try again". */
  retryLabel?: string;
  icon?: LucideIcon;
  className?: string;
}

/**
 * The panel a list shows when its fetch failed.
 *
 * `EmptyState` existed; its error sibling did not, so 24 admin list pages
 * called `toast.error` and returned — leaving a blank table that is
 * indistinguishable from "no records", after the toast had already gone. The
 * six pages that did render something invented six different treatments and
 * not one of them offered a retry, so the only recovery was a page reload.
 *
 * Shape follows `EmptyState` (same radius, padding and heading scale) but
 * solid rather than dashed and tinted with the destructive token: an empty
 * list is a normal state, a failed one is not.
 */
export function ErrorState({
  title,
  description,
  onRetry,
  retryLabel,
  icon: Icon = AlertTriangle,
  className,
}: ErrorStateProps) {
  const t = useTranslations("common");

  return (
    <div
      role="alert"
      className={cn(
        "rounded-2xl border border-destructive/25 bg-destructive/[0.04] px-4 py-8 text-center sm:px-6 sm:py-12",
        className
      )}
    >
      <Icon className="mx-auto mb-3 h-10 w-10 text-destructive sm:mb-4 sm:h-12 sm:w-12" aria-hidden="true" />
      <h3 className="heading-subsection font-semibold text-foreground">
        {title ?? t("errorStateTitle")}
      </h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        {description ?? t("errorStateDescription")}
      </p>
      {onRetry && (
        <div className="mt-5 flex justify-center">
          <Button onClick={onRetry} className="min-h-11 rounded-xl px-5 text-sm font-semibold sm:min-h-9">
            {retryLabel ?? t("errorStateRetry")}
          </Button>
        </div>
      )}
    </div>
  );
}
