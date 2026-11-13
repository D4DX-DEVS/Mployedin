"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";

interface HomeHeaderProps {
  locale: string;
  greeting: string;
  /** "Role · Location", when known. */
  subtitle: string | null;
  completion: number;
  missingDetails: number;
}

/**
 * The home's first row: how complete the profile is (as a ring), who the page
 * is for, and the one way to change what it recommends. It replaces the
 * greeting box, the phone-only completeness card and the completeness strip
 * that used to close the page — the number now appears once.
 */
export function HomeHeader({ locale, greeting, subtitle, completion, missingDetails }: HomeHeaderProps) {
  const t = useTranslations("jobSeekerHome");
  const numberLocale = locale === "ar" ? "ar-SA" : "en-US";
  const percent = Math.max(0, Math.min(100, Math.round(completion)));
  const radius = 30;
  const circumference = 2 * Math.PI * radius;

  return (
    <section className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 sm:flex sm:flex-wrap sm:gap-5">
      <Link
        href={`/${locale}/job-seeker/profile`}
        className="relative grid size-14 shrink-0 place-items-center rounded-full sm:size-[72px]"
        aria-label={t("profileCard.profileCompletenessAria", { completion: percent.toLocaleString(numberLocale) })}
        data-profile-ring
      >
        <svg viewBox="0 0 72 72" className="absolute inset-0 size-full -rotate-90" aria-hidden>
          <circle cx="36" cy="36" r={radius} fill="none" strokeWidth="6" className="stroke-muted" />
          <circle
            cx="36"
            cy="36"
            r={radius}
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            className="stroke-primary"
            strokeDasharray={`${(percent / 100) * circumference} ${circumference}`}
          />
        </svg>
        <span className="relative text-sm font-bold text-foreground sm:text-base">
          {percent.toLocaleString(numberLocale)}%
        </span>
      </Link>

      <div className="min-w-0 sm:flex-[1_1_300px]">
        {/* data-greeting: one step smaller on phones (globals.css). */}
        <h1 data-greeting="true" className="heading-page text-balance text-foreground wrap-break-word">
          {greeting}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {subtitle && <span className="capitalize">{subtitle}</span>}
          {subtitle && missingDetails > 0 && <span aria-hidden> · </span>}
          {missingDetails > 0 ? (
            <Link href={`/${locale}/job-seeker/profile`} className="font-semibold text-primary hover:underline">
              {t("header.addDetails", { count: missingDetails })}
            </Link>
          ) : (
            !subtitle && t("greeting.subtitle")
          )}
        </p>
      </div>

      <Button asChild variant="outline" className="col-span-2 min-h-11 rounded-xl px-4 sm:col-span-1">
        <Link href={`/${locale}/job-seeker/preferences`}>
          <SlidersHorizontal className="me-2 size-4" aria-hidden />
          {t("greeting.editPreferences")}
        </Link>
      </Button>
    </section>
  );
}
