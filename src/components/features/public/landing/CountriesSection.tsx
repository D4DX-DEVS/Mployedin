import Link from "next/link";
import { useTranslations } from "next-intl";

import { getLocalizedCountryName } from "@/lib/i18n/locations";
import type { LandingStats } from "./types";

interface CountriesSectionProps {
  locale: string;
  stats: LandingStats | null | undefined;
}

/** Real open-job counts per country, taken from the live jobs. Hidden until there are some. */
export function CountriesSection({ locale, stats }: CountriesSectionProps) {
  const t = useTranslations("landing");
  if (!stats) return null;

  const tiles = [
    ...stats.topCountries.map((country) => ({
      key: country.name,
      label: (locale === "ar" && country.nameAr) || getLocalizedCountryName(country.name, locale),
      location: country.name,
      count: country.count,
    })),
    ...(stats.remoteJobs > 0
      ? [{ key: "remote", label: t("countryRemote"), location: "Remote", count: stats.remoteJobs }]
      : []),
  ];
  if (tiles.length === 0) return null;

  return (
    <section id="countries" className="container mx-auto px-4 pt-12 sm:px-6 lg:pt-16">
      <h2 className="mb-5 text-3xl font-extrabold tracking-[-0.02em] text-foreground sm:text-4xl">{t("countriesTitle")}</h2>
      <ul className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <li key={tile.key}>
            <Link
              href={`/${locale}/jobs?location=${encodeURIComponent(tile.location)}`}
              className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-primary/25"
            >
              <span className="text-base font-extrabold text-foreground">{tile.label}</span>
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-sm font-bold text-primary">
                {t("countryJobCount", { count: tile.count })}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
