"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AiExplainerSection } from "./landing/AiExplainerSection";
import { BannerCarousel } from "./landing/BannerCarousel";
import { BenefitsSection } from "./landing/BenefitsSection";
import { BrowseSection } from "./landing/BrowseSection";
import { ClosingSection } from "./landing/ClosingSection";
import { FaqSection, PostsSection, TestimonialsSection, VideosSection } from "./landing/CmsSections";
import { CountriesSection } from "./landing/CountriesSection";
import { HeroSection } from "./landing/HeroSection";
import { InstallSection } from "./landing/InstallSection";
import { JourneySection } from "./landing/JourneySection";
import { StatsSection } from "./landing/StatsSection";
import type { Audience, LandingData } from "./landing/types";

export default function LandingPage() {
  const pathname = usePathname();
  const locale = pathname.split("/")[1] || "en";
  const t = useTranslations("landing");

  const [data, setData] = useState<LandingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [audience, setAudience] = useState<Audience>("jobSeeker");

  const loadLandingData = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    fetch("/api/public/landing")
      .then((response) => {
        if (!response.ok) throw new Error("Landing content request failed");
        return response.json();
      })
      .then((payload) => setData(payload))
      .catch(() => {
        setData(null);
        setLoadError(true);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadLandingData();
  }, [loadLandingData]);

  return (
    <div className="flex flex-col overflow-hidden">
      <HeroSection locale={locale} audience={audience} onAudienceChange={setAudience} />

      {loading && (
        <section className="container mx-auto px-4 pt-12 sm:px-6 lg:pt-16" aria-label={t("contentLoading")} aria-busy="true">
          <div className="skeleton-shimmer h-64 rounded-3xl" />
        </section>
      )}

      {loadError && (
        <section role="alert" className="container mx-auto px-4 pt-12 sm:px-6 lg:pt-16">
          <div className="flex flex-col items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-center sm:flex-row sm:text-start">
            <p className="text-sm text-amber-900">{t("optionalContentError")}</p>
            <Button type="button" variant="outline" size="sm" onClick={loadLandingData} className="min-h-11 gap-2">
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              {t("retry")}
            </Button>
          </div>
        </section>
      )}

      <BannerCarousel locale={locale} banners={data?.banners ?? []} />
      <StatsSection locale={locale} stats={data?.stats} />
      <BenefitsSection locale={locale} audience={audience} />
      <BrowseSection locale={locale} />
      <AiExplainerSection />
      <JourneySection locale={locale} />
      <CountriesSection locale={locale} stats={data?.stats} />
      <VideosSection locale={locale} videos={data?.videos ?? []} />
      <TestimonialsSection locale={locale} testimonials={data?.testimonials ?? []} />
      <PostsSection locale={locale} posts={data?.recentPosts ?? []} />
      <InstallSection />
      <FaqSection locale={locale} faqs={data?.faqs ?? []} />
      <ClosingSection locale={locale} />
    </div>
  );
}
