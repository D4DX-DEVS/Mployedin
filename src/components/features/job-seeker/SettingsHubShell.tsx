"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/shared/PageHeader";
import { cn } from "@/lib/utils";
import { JobSeekerSectionNav, SETTINGS_SECTION_PATHS } from "./JobSeekerSectionNav";

export interface SettingsHubShellProps {
  locale: string;
  className?: string;
  children: ReactNode;
}

/**
 * One Settings page for the job seeker: Notifications, Privacy & data,
 * Interview availability, Account and Plan & billing.
 *
 * These used to be a tabbed form with no heading plus three separate pages
 * (notifications, privacy, subscription) that you could only reach from an
 * e-mail footer or the avatar menu. Each tab stays its own route — e-mail
 * footers and the unsubscribe page link /settings/notifications — so this
 * shell is what makes them one place.
 */
export function SettingsHubShell({ locale, className, children }: SettingsHubShellProps) {
  const t = useTranslations("jobSeekerExtra.settings");
  return (
    <div className={cn("page-container max-w-5xl", className)}>
      <PageHeader title={t("pageTitle")} description={t("pageDescription")} />
      <JobSeekerSectionNav locale={locale} paths={SETTINGS_SECTION_PATHS} label={t("navLabel")} />
      {children}
    </div>
  );
}
