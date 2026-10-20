import { useTranslations } from "next-intl";

import type { LandingStats } from "./types";

interface StatsSectionProps {
  locale: string;
  stats: LandingStats | null | undefined;
}

/** Live platform numbers. A number that is zero is left out rather than shown as a boast of nothing. */
export function StatsSection({ locale, stats }: StatsSectionProps) {
  const t = useTranslations("landing");
  if (!stats) return null;

  const format = new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US");
  const items = [
    { value: stats.activeJobs, label: t("activeJobs"), note: t("statsActiveJobsNote") },
    { value: stats.verifiedEmployers, label: t("verifiedEmployers"), note: t("statsVerifiedEmployersNote") },
    { value: stats.countries, label: t("statsCountries"), note: t("statsCountriesNote") },
    { value: stats.placementsThisMonth, label: t("statsPlacements"), note: t("statsPlacementsNote") },
  ].filter((item) => item.value > 0);

  if (items.length === 0) return null;

  // Fill the row at every width: three numbers use three columns, not three of four.
  const columns = items.length === 4 ? "lg:grid-cols-4" : items.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2";

  return (
    <section aria-label={t("statsLabel")} className="container mx-auto px-4 pt-12 sm:px-6 lg:pt-16">
      <dl className={`grid grid-cols-2 gap-3 sm:gap-4 ${columns}`}>
        {items.map((item) => (
          <div key={item.label} className="flex flex-col gap-1 rounded-2xl border border-border/70 bg-card p-4 sm:p-6 [&:nth-child(odd):last-child]:col-span-2 lg:[&:nth-child(odd):last-child]:col-span-1">
            <dt className="order-2 mt-1 text-sm font-bold text-foreground sm:text-base">{item.label}</dt>
            <dd className="order-1 text-3xl font-extrabold leading-none tracking-[-0.03em] text-primary sm:text-4xl lg:text-[2.75rem]">
              {format.format(item.value)}
            </dd>
            <dd className="order-3 text-xs text-muted-foreground sm:text-sm">{item.note}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
