"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";

import { PublicImage } from "@/components/shared/PublicImage";
import type { Banner } from "./types";

interface BannerCarouselProps {
  locale: string;
  banners: Banner[];
}

/** Featured campaigns from the CMS; renders nothing without a real banner. */
export function BannerCarousel({ locale, banners }: BannerCarouselProps) {
  const t = useTranslations("landing");
  const isAr = locale === "ar";
  const [index, setIndex] = useState(0);
  const [manuallyPaused, setManuallyPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const paused = manuallyPaused || hovered;

  const next = useCallback(() => {
    if (banners.length > 1) setIndex((current) => (current + 1) % banners.length);
  }, [banners.length]);
  const prev = useCallback(() => {
    if (banners.length > 1) setIndex((current) => (current - 1 + banners.length) % banners.length);
  }, [banners.length]);

  useEffect(() => {
    if (banners.length <= 1 || paused) return;
    const timer = window.setInterval(next, 6500);
    return () => window.clearInterval(timer);
  }, [banners.length, paused, next]);

  const active = banners[index % Math.max(banners.length, 1)];
  if (!active) return null;

  const title = isAr ? active.titleAr || active.title : active.title;
  const subtitle = isAr ? active.subtitleAr || active.subtitle : active.subtitle;
  const linkText = (isAr ? active.linkTextAr || active.linkText : active.linkText) || t("view");
  const controlClass = "inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card hover:bg-muted";

  return (
    <section
      className="container mx-auto px-4 pt-12 sm:px-6 lg:pt-16"
      aria-label={t("featuredCampaigns")}
      aria-roledescription="carousel"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex flex-col gap-6 rounded-[1.75rem] bg-[linear-gradient(135deg,hsl(var(--brand-blue-dark))_0%,hsl(var(--brand-blue))_100%)] p-6 text-white sm:p-10 md:flex-row md:items-center">
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-3">
          <h2 className="text-2xl font-extrabold leading-tight tracking-[-0.02em] sm:text-4xl" aria-live="polite">{title}</h2>
          {subtitle && <p className="text-base leading-7 text-white/90 sm:text-lg">{subtitle}</p>}
          <Link
            href={active.linkUrl || `/${locale}/jobs`}
            className="inline-flex min-h-11 items-center self-start rounded-xl bg-white px-5 text-sm font-extrabold text-[hsl(var(--brand-blue-dark))]"
          >
            {linkText}
          </Link>
        </div>
        <PublicImage key={active._id} src={active.image} alt={title} className="h-44 w-full rounded-2xl object-cover md:h-52 md:w-5/12" />
      </div>

      {banners.length > 1 && (
        <div className="mt-3.5 flex items-center justify-center gap-2.5">
          <button type="button" onClick={prev} aria-label={t("previousBanner")} className={controlClass}>
            <ChevronLeft className="h-5 w-5 rtl:rotate-180" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setManuallyPaused((value) => !value)}
            aria-label={manuallyPaused ? t("playBanner") : t("pauseBanner")}
            aria-pressed={manuallyPaused}
            className={controlClass}
          >
            {manuallyPaused ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
          </button>
          <div className="flex gap-1.5" aria-hidden="true">
            {banners.map((banner, dot) => (
              <span key={banner._id} className={`h-2 rounded-full ${dot === index ? "w-6 bg-primary" : "w-2 bg-border"}`} />
            ))}
          </div>
          <button type="button" onClick={next} aria-label={t("nextBanner")} className={controlClass}>
            <ChevronRight className="h-5 w-5 rtl:rotate-180" aria-hidden="true" />
          </button>
        </div>
      )}
    </section>
  );
}
