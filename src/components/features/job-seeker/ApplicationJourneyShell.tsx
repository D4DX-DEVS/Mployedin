"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/shared/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { useJobSeekerActionCountsQuery } from "@/hooks/useJobSeekerActionCounts";
import { JobSeekerSectionNav, APPLICATION_JOURNEY_PATHS } from "./JobSeekerSectionNav";

export interface ApplicationJourneyShellProps {
  locale: string;
  /**
   * One truthful, account-wide line under the title.
   * `undefined` = still loading → skeleton. `null` = unavailable → nothing.
   * A real 0 is fine; a 0 that means "not loaded yet" is not, which is why the
   * two states are separate.
   */
  context?: string | null;
  /** Search / Filters / Export / view toggle row. */
  toolbar?: ReactNode;
  /** Status pill row, under the toolbar. */
  filters?: ReactNode;
  /** Pagination or anything else that belongs in the panel footer. */
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * The frame around the four stages of one application: Applications,
 * Interviews, Offers, Onboarding.
 *
 * Each stage is still its own route (notification e-mails, the calendar
 * redirect and the nav tests all point at them), so what makes them read as one
 * place is this shell: the same h1, the same context line, the same journey row
 * with live badges, and the same slot for whatever toolbar the stage needs. The
 * panel itself is the one the Applications page already had — flat on phones,
 * a card from sm up — lifted here so the other three routes inherit it.
 */
export function ApplicationJourneyShell({ locale, context, toolbar, filters, footer, children }: ApplicationJourneyShellProps) {
  const t = useTranslations("jobSeekerJourney");
  const { data: counts } = useJobSeekerActionCountsQuery();

  return (
    <div className="page-container">
      <section className="card-base overflow-hidden rounded-3xl border border-border/70 shadow-[0_8px_24px_rgba(15,23,42,0.05)] max-sm:rounded-none max-sm:border-0 max-sm:bg-transparent max-sm:shadow-none panel-body">
        <div className="border-b border-border/60 px-3.5 py-3 max-sm:px-0 sm:px-4 sm:py-3.5 lg:px-5 lg:py-4">
          <div className="flex flex-col gap-2.5">
            <div className="min-w-0">
              <PageHeader title={t("title")} description={context ?? undefined} />
              {context === undefined && (
                <Skeleton data-testid="journey-context-skeleton" aria-hidden="true" className="mt-1 h-4 w-44" />
              )}
            </div>

            <JobSeekerSectionNav
              locale={locale}
              paths={APPLICATION_JOURNEY_PATHS}
              counts={counts}
              label={t("navLabel")}
            />

            {toolbar}
            {filters}
          </div>
        </div>

        <div className="px-3.5 py-3 max-sm:px-0 max-sm:pt-2 sm:px-4 sm:py-3.5 lg:px-5 lg:py-4">{children}</div>

        {footer && (
          <div className="border-t border-border/60 bg-muted/10 px-3.5 py-3 max-sm:bg-transparent max-sm:px-0 sm:px-4 sm:py-3.5 lg:px-5">
            {footer}
          </div>
        )}
      </section>
    </div>
  );
}
