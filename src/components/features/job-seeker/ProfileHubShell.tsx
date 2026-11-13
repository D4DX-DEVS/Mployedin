"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/shared/PageHeader";
import { cn } from "@/lib/utils";
import { JobSeekerSectionNav, PROFILE_SECTION_PATHS } from "./JobSeekerSectionNav";

export interface ProfileHubShellProps {
  locale: string;
  /** Buttons beside the title (e.g. Settings on the overview). */
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}

/**
 * The frame around every tab of My Profile: Overview, Personal details,
 * CV & documents and Job preferences.
 *
 * Each tab is still its own route, but before this shell only the overview
 * rendered the tab row — one click on any tab swapped it for a "Back" link and
 * a page of a different width, so the seeker lost their place. Every tab now
 * shares the same h1, the same row and the same container.
 */
export function ProfileHubShell({ locale, actions, className, children }: ProfileHubShellProps) {
  const t = useTranslations("jobSeekerExtra.profile");
  return (
    <div className={cn("page-container max-w-5xl", className)}>
      <PageHeader
        title={t("title")}
        description={t("description")}
        className="max-sm:flex-row max-sm:items-start max-sm:[&>.page-header-actions]:w-auto max-sm:[&>.page-header-actions]:shrink-0"
        actions={actions}
      />
      <JobSeekerSectionNav locale={locale} paths={PROFILE_SECTION_PATHS} label={t("navLabel")} />
      {children}
    </div>
  );
}
