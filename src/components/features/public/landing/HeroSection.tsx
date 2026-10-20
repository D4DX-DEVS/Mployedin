"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Briefcase, CheckCircle2, MapPin, Search, Sparkles, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Audience } from "./types";

interface HeroSectionProps {
  locale: string;
  audience: Audience;
  onAudienceChange: (audience: Audience) => void;
}

const POPULAR_SEARCH_KEYS = ["quickSearchEngineering", "quickSearchHospitality", "quickSearchSales"] as const;

/** Decorative sample rows beside the search: initials and bars only, no job titles or scores to mistake for real ones. */
const PREVIEW_ROWS = {
  jobSeeker: ["UX", "PM", "DA"],
  employer: ["SA", "MK", "EN"],
} as const;

export function HeroSection({ locale, audience, onAudienceChange }: HeroSectionProps) {
  const t = useTranslations("landing");
  const isSeeker = audience === "jobSeeker";

  return (
    <section id="top" className="relative border-b border-border/60 bg-[radial-gradient(circle_at_12%_8%,hsl(var(--brand-blue-pale))_0%,transparent_34%),radial-gradient(circle_at_88%_72%,hsl(var(--brand-cyan)/0.12)_0%,transparent_30%),linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--surface-2))_100%)]">
      <div className="container relative mx-auto px-4 py-12 sm:px-6 lg:py-16">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)] lg:gap-14">
          <div className="flex flex-col items-center gap-5 text-center lg:items-start lg:text-start">
            <div className="inline-flex rounded-full border border-border/70 bg-card/90 p-1 shadow-sm" role="group" aria-label={t("audienceLabel")}>
              {(["jobSeeker", "employer"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onAudienceChange(value)}
                  aria-pressed={audience === value}
                  className={`min-h-11 rounded-full px-5 text-sm font-semibold transition-all ${
                    audience === value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t(value)}
                </button>
              ))}
            </div>

            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-primary">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {t("heroEyebrow")}
            </p>
            <h1 className="text-balance text-4xl font-bold tracking-[-0.03em] text-foreground sm:text-5xl lg:text-[3.5rem] lg:leading-[1.06]">
              {isSeeker ? t("heroTitle") : t("employerHeroTitle")}
            </h1>
            <p className="max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
              {isSeeker ? t("heroDescription") : t("employerHeroDescription")}
            </p>

            {isSeeker ? (
              // A plain GET form: it works before the page's scripts load and needs no client logic.
              <form method="GET" action={`/${locale}/jobs`} role="search" className="w-full max-w-2xl rounded-2xl border border-border/70 bg-card p-2.5 text-start shadow-[0_20px_60px_-30px_rgba(15,23,42,0.35)]">
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <label className="hero-search-field flex min-h-14 cursor-text flex-col justify-center gap-1 rounded-xl border border-border/70 bg-background px-4 py-2 transition-[border-color,box-shadow]">
                    <span className="text-[11px] font-semibold text-muted-foreground">{t("jobSearchLabel")}</span>
                    <span className="flex items-center gap-2">
                      <Search className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      <input
                        name="search"
                        maxLength={100}
                        autoComplete="off"
                        enterKeyHint="search"
                        placeholder={t("searchPlaceholder")}
                        className="h-6 w-full min-w-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/80"
                      />
                    </span>
                  </label>
                  <label className="hero-search-field flex min-h-14 cursor-text flex-col justify-center gap-1 rounded-xl border border-border/70 bg-background px-4 py-2 transition-[border-color,box-shadow]">
                    <span className="text-[11px] font-semibold text-muted-foreground">{t("locationSearchLabel")}</span>
                    <span className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      <input
                        name="location"
                        maxLength={100}
                        autoComplete="off"
                        enterKeyHint="search"
                        placeholder={t("locationPlaceholder")}
                        className="h-6 w-full min-w-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/80"
                      />
                    </span>
                  </label>
                  <Button size="lg" type="submit" className="min-h-12 rounded-xl text-sm font-bold sm:col-span-2">
                    {t("findJobs2")}
                  </Button>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2 px-1 pb-1 lg:justify-start">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t("popularSearches")}</span>
                  {POPULAR_SEARCH_KEYS.map((key) => (
                    <Link
                      key={key}
                      href={`/${locale}/jobs?search=${encodeURIComponent(t(key))}`}
                      className="inline-flex min-h-9 items-center rounded-full border border-border/70 bg-muted/40 px-3.5 text-xs font-semibold text-foreground transition-colors hover:border-primary/30 hover:text-primary"
                    >
                      {t(key)}
                    </Link>
                  ))}
                </div>
              </form>
            ) : (
              <div className="flex w-full max-w-xl flex-col items-center gap-3 sm:flex-row lg:items-start">
                <Link href={`/${locale}/employer-register`} className="w-full sm:w-auto">
                  <Button size="lg" className="w-full min-w-44 rounded-xl">{t("startHiring")}</Button>
                </Link>
                <Link href={`/${locale}/login`} className="w-full sm:w-auto">
                  <Button size="lg" variant="outline" className="w-full min-w-44 rounded-xl">{t("employerSignIn")}</Button>
                </Link>
              </div>
            )}

            <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 lg:justify-start">
              {[t("liveOpportunities"), t("verifiedEmployers"), t("directApplications")].map((item) => (
                <li key={item} className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <aside aria-hidden="true" className="relative mx-auto hidden w-full max-w-md lg:block">
            <div className="absolute -inset-8 rounded-full bg-primary/10 blur-3xl" />
            <div className="relative flex flex-col gap-3.5 rounded-3xl border border-border/70 bg-card/95 p-5 shadow-[0_24px_48px_-24px_hsl(var(--brand-blue)/0.35)]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">{isSeeker ? t("previewForYou") : t("previewPipeline")}</p>
                  <p className="mt-1 text-lg font-extrabold text-foreground">{isSeeker ? t("previewMatches") : t("previewCandidates")}</p>
                </div>
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  {isSeeker ? <Briefcase className="h-5 w-5" /> : <Users className="h-5 w-5" />}
                </span>
              </div>
              {PREVIEW_ROWS[audience].map((initials) => (
                <div key={initials} className="flex items-center gap-3.5 rounded-2xl border border-border/70 p-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-extrabold text-primary">{initials}</span>
                  <div className="min-w-0 flex-1">
                    <div className="h-3 w-2/3 rounded-full bg-foreground/80" />
                    <div className="mt-2 h-2 w-1/2 rounded-full bg-muted-foreground/25" />
                  </div>
                </div>
              ))}
              <p className="rounded-xl bg-[hsl(var(--brand-blue-pale))] px-3.5 py-3 text-sm leading-5 text-foreground/80">
                {isSeeker ? t("previewInsightSeeker") : t("previewInsightEmployer")}
              </p>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
