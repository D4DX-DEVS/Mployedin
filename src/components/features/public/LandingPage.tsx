"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Briefcase,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  MapPin,
  Pause,
  Play,
  RotateCcw,
  Rocket,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/ui/intlFormat";

interface Banner {
  _id: string;
  title: string;
  titleAr: string;
  subtitle: string;
  subtitleAr: string;
  image: string;
  imageMobile?: string;
  linkUrl: string;
  linkText: string;
  linkTextAr: string;
}

interface FAQ {
  _id: string;
  question: string;
  questionAr: string;
  answer: string;
  answerAr: string;
  category: string;
}

interface Testimonial {
  _id: string;
  name: string;
  nameAr: string;
  designation: string;
  designationAr: string;
  company: string;
  companyAr: string;
  quote: string;
  quoteAr: string;
  avatar: string;
  rating: number;
}

interface Video {
  _id: string;
  title: string;
  titleAr: string;
  description: string;
  descriptionAr: string;
  url: string;
  thumbnail: string;
}

interface BlogPost {
  _id: string;
  title: string;
  titleAr: string;
  slug: string;
  excerpt: string;
  excerptAr: string;
  coverImage: string;
  author: string;
  publishedAt: string;
}

interface LandingData {
  banners: Banner[];
  faqs: FAQ[];
  testimonials: Testimonial[];
  videos: Video[];
  recentPosts: BlogPost[];
}

export default function LandingPage() {
  const pathname = usePathname();
  const router = useRouter();
  const locale = pathname.split("/")[1] || "en";
  const isAr = locale === "ar";
  const t = useTranslations("landing");

  const [data, setData] = useState<LandingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [bannerIndex, setBannerIndex] = useState(0);
  const [bannerManuallyPaused, setBannerManuallyPaused] = useState(false);
  const [bannerHovered, setBannerHovered] = useState(false);
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [locationTerm, setLocationTerm] = useState("");
  const [audience, setAudience] = useState<"jobSeeker" | "employer">("jobSeeker");
  const bannerPaused = bannerManuallyPaused || bannerHovered;

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

  const banners = data?.banners ?? [];

  const nextBanner = useCallback(() => {
    if (banners.length > 1) {
      setBannerIndex((prev) => (prev + 1) % banners.length);
    }
  }, [banners.length]);

  const prevBanner = useCallback(() => {
    if (banners.length > 1) {
      setBannerIndex((prev) => (prev - 1 + banners.length) % banners.length);
    }
  }, [banners.length]);

  useEffect(() => {
    if (banners.length <= 1 || bannerPaused) {
      return;
    }

    const timer = window.setInterval(nextBanner, 6500);
    return () => window.clearInterval(timer);
  }, [bannerPaused, banners.length, nextBanner]);

  const activeBanner = banners[bannerIndex] ?? null;

  const quickSearches = [
    t("quickSearchEngineering"),
    t("quickSearchHospitality"),
    t("quickSearchSales"),
    t("quickSearchRemote"),
    t("quickSearchSupplyChain"),
  ];

  const functionalAreas = [
    t("areaHardware"),
    t("areaSalesBD"),
    t("areaArchitects"),
    t("areaMaintenance"),
    t("areaRestaurant"),
    t("areaSupplyChain"),
    t("areaAccounts"),
    t("areaResearch"),
  ];

  const industries = [
    t("industryRecruitment"),
    t("industryEngineering"),
    t("industryTextiles"),
    t("industryEvents"),
    t("industryAdvertising"),
    t("industryFMCG"),
    t("industryHospitality"),
    t("industryRetail"),
  ];

  const promotionalBenefits = audience === "jobSeeker"
    ? [
        { icon: Sparkles, title: t("seekerBenefitOneTitle"), description: t("seekerBenefitOneDescription") },
        { icon: Target, title: t("seekerBenefitTwoTitle"), description: t("seekerBenefitTwoDescription") },
        { icon: ShieldCheck, title: t("seekerBenefitThreeTitle"), description: t("seekerBenefitThreeDescription") },
      ]
    : [
        { icon: Target, title: t("employerBenefitOneTitle"), description: t("employerBenefitOneDescription") },
        { icon: BarChart3, title: t("employerBenefitTwoTitle"), description: t("employerBenefitTwoDescription") },
        { icon: BadgeCheck, title: t("employerBenefitThreeTitle"), description: t("employerBenefitThreeDescription") },
      ];

  const journeySteps = [
    { number: "01", title: t("journeyStepOneTitle"), description: t("journeyStepOneDescription") },
    { number: "02", title: t("journeyStepTwoTitle"), description: t("journeyStepTwoDescription") },
    { number: "03", title: t("journeyStepThreeTitle"), description: t("journeyStepThreeDescription") },
  ];

  const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const params = new URLSearchParams();
    if (searchTerm.trim()) params.set("search", searchTerm.trim());
    if (locationTerm.trim()) params.set("location", locationTerm.trim());
    const target = params.size > 0 ? `/${locale}/jobs?${params.toString()}` : `/${locale}/jobs`;
    router.push(target);
  };

  const getEmbedUrl = (url: string) => {
    const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch) {
      return `https://www.youtube.com/embed/${ytMatch[1]}`;
    }

    const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
    if (vimeoMatch) {
      return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
    }

    return url;
  };

  return (
    <div className="flex flex-col overflow-hidden">
      <section className="relative border-b border-border/60 bg-[radial-gradient(circle_at_12%_8%,hsl(var(--brand-blue-pale))_0%,transparent_34%),radial-gradient(circle_at_88%_72%,hsl(var(--brand-cyan)/0.12)_0%,transparent_30%),linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--surface-2))_100%)]">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.14)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.14)_1px,transparent_1px)] bg-[size:72px_72px] [mask-image:linear-gradient(to_bottom,black,transparent_92%)]" />
        <div className="container relative mx-auto px-4 py-10 sm:px-6 lg:py-16 xl:py-20">
          <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(380px,0.85fr)] lg:gap-14">
            <div className="text-center lg:text-start">
              <div
                className="mb-7 inline-flex rounded-full border border-border/70 bg-card/90 p-1 shadow-sm"
                role="group"
                aria-label={t("audienceLabel")}
              >
                {(["jobSeeker", "employer"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setAudience(value)}
                    aria-pressed={audience === value}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition-all ${
                      audience === value
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t(value)}
                  </button>
                ))}
              </div>

              <div className="mb-4 flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary lg:justify-start">
                <Sparkles className="h-4 w-4" />
                {t("heroEyebrow")}
              </div>

              <h1 className="text-4xl font-bold tracking-[-0.04em] text-foreground sm:text-5xl lg:text-[3.75rem] lg:leading-[1.04]">
                {audience === "jobSeeker" ? t("heroTitle") : t("employerHeroTitle")}
              </h1>

              <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg lg:mx-0">
                {audience === "jobSeeker" ? t("heroDescription") : t("employerHeroDescription")}
              </p>

              {audience === "jobSeeker" ? (
              <form onSubmit={handleSearch} className="mx-auto mt-8 max-w-2xl rounded-2xl border border-border/70 bg-card shadow-[0_20px_60px_-30px_rgba(15,23,42,0.35)] lg:mx-0 chip-pad">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex min-h-12 flex-col items-start justify-center rounded-xl border border-border/70 px-4 text-start">
                    <span className="text-[11px] font-semibold text-muted-foreground">{t("jobSearchLabel")}</span>
                    <span className="flex w-full items-center gap-2">
                    <Search className="h-4 w-4 shrink-0 text-primary" />
                    <input
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      placeholder={t("searchPlaceholder")}
                      className="h-full w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                    />
                    </span>
                  </label>

                  <label className="flex min-h-12 flex-col items-start justify-center rounded-xl border border-border/70 px-4 text-start">
                    <span className="text-[11px] font-semibold text-muted-foreground">{t("locationSearchLabel")}</span>
                    <span className="flex w-full items-center gap-2">
                    <MapPin className="h-4 w-4 shrink-0 text-primary" />
                    <input
                      value={locationTerm}
                      onChange={(event) => setLocationTerm(event.target.value)}
                      placeholder={t("locationPlaceholder")}
                      className="h-full w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                    />
                    </span>
                  </label>

                  <Button size="lg" type="submit" className="rounded-xl px-6 text-sm font-semibold sm:col-span-2">
                    {t("findJobs2")}
                  </Button>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-center gap-2 lg:justify-start">
                  <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    {t("popularSearches")}
                  </span>
                  {quickSearches.slice(0, 3).map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => router.push(`/${locale}/jobs?search=${encodeURIComponent(item)}`)}
                      className="rounded-full border border-border/70 bg-muted/30 px-3 py-1 text-xs text-foreground transition-colors hover:border-primary/25 hover:text-primary"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </form>
              ) : (
                <div className="mx-auto mt-8 flex max-w-xl flex-col items-center justify-center gap-3 sm:flex-row lg:mx-0 lg:justify-start">
                  <Link href={`/${locale}/employer-register`} className="w-full sm:w-auto">
                    <Button size="lg" className="w-full min-w-44 rounded-xl">{t("startHiring")}</Button>
                  </Link>
                  <Link href={`/${locale}/login`} className="w-full sm:w-auto">
                    <Button size="lg" variant="outline" className="w-full min-w-44 rounded-xl">{t("employerSignIn")}</Button>
                  </Link>
                </div>
              )}

              <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 lg:justify-start">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">{t("liveOpportunities")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">{t("verifiedEmployers")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">{t("directApplications")}</span>
                </div>
              </div>
            </div>

            <div className="relative mx-auto hidden w-full max-w-lg lg:block" aria-hidden="true">
              <div className="absolute -inset-8 rounded-full bg-primary/10 blur-3xl" />
              <div className="relative rotate-[1deg] rounded-[2rem] border border-white/60 bg-card/90 shadow-[0_40px_100px_-42px_rgba(30,47,108,0.48)] backdrop-blur panel-body">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                      {audience === "jobSeeker" ? t("previewForYou") : t("previewPipeline")}
                    </p>
                    <p className="mt-1 text-lg font-semibold text-foreground">
                      {audience === "jobSeeker" ? t("previewMatches") : t("previewCandidates")}
                    </p>
                  </div>
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    {audience === "jobSeeker" ? <Briefcase className="h-5 w-5" /> : <Users className="h-5 w-5" />}
                  </span>
                </div>

                <div className="space-y-3">
                  {[92, 87, 81].map((score, index) => (
                    <div key={score} className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background/75 p-3.5">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(135deg,hsl(var(--brand-blue-dark)),hsl(var(--brand-cyan)))] text-sm font-bold text-white">
                        {audience === "jobSeeker" ? ["UX", "PM", "DA"][index] : ["SA", "MK", "EN"][index]}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="h-3 w-2/3 rounded-full bg-foreground/80" />
                        <div className="mt-2 h-2 w-1/2 rounded-full bg-muted-foreground/25" />
                      </div>
                      <div className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-700">
                        {score}%
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex items-center gap-3 rounded-2xl bg-[linear-gradient(135deg,hsl(var(--brand-blue-dark)),hsl(var(--brand-blue)))] p-4 text-white">
                  <Sparkles className="h-5 w-5 shrink-0 text-[hsl(var(--brand-cyan))]" />
                  <p className="text-sm font-medium leading-5">
                    {audience === "jobSeeker" ? t("previewInsightSeeker") : t("previewInsightEmployer")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Banner carousel — only shown when actual campaign banners exist */}
      {banners.length > 0 && (
        <section
          className="border-b border-border/60 bg-[linear-gradient(135deg,hsl(var(--brand-blue-dark))_0%,hsl(var(--brand-blue))_100%)] py-6"
          aria-label={t("featuredCampaigns")}
          aria-roledescription="carousel"
          onMouseEnter={() => setBannerHovered(true)}
          onMouseLeave={() => setBannerHovered(false)}
        >
          <div className="container mx-auto px-4 sm:px-6">
            <div className="flex items-center gap-6">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-4">
                  {activeBanner?.image && (
                    <img
                      src={activeBanner.image}
                      alt={isAr ? activeBanner.titleAr || activeBanner.title : activeBanner.title}
                      className="hidden h-16 w-24 rounded-lg object-cover sm:block"
                    />
                  )}
                  <div className="min-w-0 text-white">
                    <h3 className="heading-subsection truncate font-semibold" aria-live="polite">
                      {isAr ? activeBanner?.titleAr || activeBanner?.title : activeBanner?.title}
                    </h3>
                    <p className="mt-0.5 truncate text-sm text-white/70">
                      {isAr ? activeBanner?.subtitleAr || activeBanner?.subtitle : activeBanner?.subtitle}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {banners.length > 1 && (
                  <>
                    <button type="button" onClick={prevBanner} aria-label={t("previousBanner")} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-white hover:bg-white/10">
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={nextBanner} aria-label={t("nextBanner")} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-white hover:bg-white/10">
                      <ChevronRight className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setBannerManuallyPaused((paused) => !paused)}
                      aria-label={bannerManuallyPaused ? t("playBanner") : t("pauseBanner")}
                      aria-pressed={bannerManuallyPaused}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-white hover:bg-white/10"
                    >
                      {bannerManuallyPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                    </button>
                  </>
                )}
                <Link
                  href={activeBanner?.linkUrl || `/${locale}/jobs`}
                  className="inline-flex h-9 items-center rounded-full bg-white px-4 text-xs font-semibold text-[hsl(var(--brand-blue-dark))]"
                >
                  {activeBanner?.linkText || t("view")}
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {loading && (
        <section className="border-b border-border/60 py-8" aria-label={t("contentLoading")}>
          <div className="container mx-auto grid gap-4 px-4 sm:grid-cols-3 sm:px-6">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="skeleton-shimmer h-24 rounded-2xl" />
            ))}
          </div>
        </section>
      )}

      {loadError && (
        <section className="border-b border-border/60 py-6">
          <div className="container mx-auto flex flex-col items-center justify-between gap-3 px-4 text-center sm:flex-row sm:px-6 sm:text-start">
            <p className="text-sm text-muted-foreground">{t("optionalContentError")}</p>
            <Button type="button" variant="outline" size="sm" onClick={loadLandingData} className="gap-2">
              <RotateCcw className="h-4 w-4" />
              {t("retry")}
            </Button>
          </div>
        </section>
      )}

      <section className="bg-background py-14 lg:py-18">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                <Rocket className="h-4 w-4" />
                {t("benefitsEyebrow")}
              </div>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-foreground sm:text-4xl">
                {audience === "jobSeeker" ? t("seekerBenefitsTitle") : t("employerBenefitsTitle")}
              </h2>
              <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">
                {audience === "jobSeeker" ? t("seekerBenefitsDescription") : t("employerBenefitsDescription")}
              </p>
            </div>

            <Link href={audience === "jobSeeker" ? `/${locale}/register` : `/${locale}/employer-register`}>
              <Button size="lg" className="w-full gap-2 rounded-xl sm:w-auto">
                {audience === "jobSeeker" ? t("createProfile") : t("startHiring")}
                <ArrowRight className="h-4 w-4 rtl:rotate-180" />
              </Button>
            </Link>
          </div>

          <div className="mt-9 grid gap-5 md:grid-cols-3">
            {promotionalBenefits.map((benefit) => {
              const Icon = benefit.icon;
              return (
                <article
                  key={benefit.title}
                  className="group rounded-2xl border border-border/70 bg-card shadow-sm transition-all hover:-translate-y-1 hover:border-primary/25 hover:shadow-[0_20px_50px_-34px_rgba(30,47,108,0.45)] panel-body"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="heading-subsection mt-5 font-semibold text-foreground">{benefit.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{benefit.description}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-y border-border/60 bg-muted/20 py-10 lg:py-12">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_320px] xl:items-start">
            <div>
              <h2 className="heading-section font-semibold text-foreground">{t("jobsByFunctionalArea")}</h2>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {functionalAreas.map((item) => (
                  <Link
                    key={item}
                    href={`/${locale}/jobs?search=${encodeURIComponent(item)}`}
                    className="rounded-xl border border-border/70 bg-card px-4 py-3 text-sm font-medium text-foreground transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:text-primary"
                  >
                    {item}
                  </Link>
                ))}
              </div>
            </div>

            <div>
              <h2 className="heading-section font-semibold text-foreground">{t("jobsByIndustry")}</h2>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {industries.map((item) => (
                  <Link
                    key={item}
                    href={`/${locale}/jobs?search=${encodeURIComponent(item)}`}
                    className="rounded-xl border border-border/70 bg-card px-4 py-3 text-sm font-medium text-foreground transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:text-primary"
                  >
                    {item}
                  </Link>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-primary/15 bg-[linear-gradient(160deg,hsl(var(--brand-blue-dark))_0%,hsl(var(--brand-blue))_100%)] text-white shadow-[0_18px_50px_rgba(15,23,42,0.18)] panel-body">
              <h3 className="heading-subsection font-semibold">{t("hireFaster")}</h3>
              <p className="mt-4 text-sm leading-6 text-white/80">
                {t("hireFasterDesc")}
              </p>
              <Link
                href={`/${locale}/employer-register`}
                className="mt-6 inline-flex h-11 items-center rounded-full bg-white px-5 text-sm font-semibold text-[hsl(var(--brand-blue-dark))]"
              >
                {t("startHiring")}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="py-14 lg:py-18">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="overflow-hidden rounded-[2rem] bg-[linear-gradient(135deg,hsl(var(--brand-blue-dark))_0%,hsl(var(--brand-blue))_58%,hsl(var(--brand-blue-light))_140%)] px-6 py-9 text-white shadow-[0_28px_80px_-42px_rgba(30,47,108,0.65)] sm:px-9 lg:px-12 lg:py-11">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/65">{t("journeyEyebrow")}</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">{t("journeyTitle")}</h2>
                <p className="mt-4 max-w-xl text-sm leading-6 text-white/75 sm:text-base">{t("journeyDescription")}</p>
                <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                  <Link href={`/${locale}/register`}>
                    <Button size="lg" variant="secondary" className="w-full gap-2 rounded-xl sm:w-auto">
                      {t("joinFree")}
                      <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                    </Button>
                  </Link>
                  <Link href={`/${locale}/jobs`}>
                    <Button size="lg" variant="outline" className="w-full rounded-xl border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white sm:w-auto">
                      {t("exploreOpportunities")}
                    </Button>
                  </Link>
                </div>
              </div>

              <div className="grid gap-3">
                {journeySteps.map((step) => (
                  <div key={step.number} className="flex gap-4 rounded-2xl border border-white/12 bg-white/[0.07] backdrop-blur card-pad">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-xs font-bold text-[hsl(var(--brand-blue-dark))]">
                      {step.number}
                    </span>
                    <div>
                      <h3 className="font-semibold text-white">{step.title}</h3>
                      <p className="mt-1 text-sm leading-5 text-white/70">{step.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {data?.videos && data.videos.length > 0 && (
        <section className="border-y border-border/60 bg-muted/20 py-10 lg:py-12">
          <div className="container mx-auto px-4 sm:px-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="heading-section font-semibold tracking-tight text-foreground">{t("learnWorkflow")}</h2>
              </div>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                {t("learnWorkflowDesc")}
              </p>
            </div>

            <div className={`mt-8 grid gap-6 ${data.videos.length === 1 ? "max-w-4xl" : "lg:grid-cols-2 xl:grid-cols-3"}`}>
              {data.videos.slice(0, 3).map((video) => (
                <div key={video._id} className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
                  <div className="aspect-video bg-black/5">
                    <iframe
                      src={getEmbedUrl(video.url)}
                      title={isAr ? video.titleAr || video.title : video.title}
                      className="h-full w-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                  <div className="p-5">
                    <div className="inline-flex items-center gap-2 rounded-full bg-primary/[0.08] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                      <Play className="h-3.5 w-3.5" />
                      {t("watch")}
                    </div>
                    <h3 className="heading-subsection mt-4 font-semibold text-foreground">{isAr ? video.titleAr || video.title : video.title}</h3>
                    {(video.description || video.descriptionAr) && (
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {isAr ? video.descriptionAr || video.description : video.description}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {data?.testimonials && data.testimonials.length > 0 && (
        <section className="py-10 lg:py-12">
          <div className="container mx-auto px-4 sm:px-6">
            <div className="mb-8 text-center">
              <h2 className="heading-section font-semibold tracking-tight text-foreground">{t("testimonialHeading")}</h2>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              {data.testimonials.slice(0, 3).map((testimonial) => (
                <div key={testimonial._id} className="rounded-2xl border border-border/70 bg-card shadow-sm panel-body">
                  <div className="flex gap-1">
                    {Array.from({ length: testimonial.rating }).map((_, index) => (
                      <Star key={index} className="h-4 w-4 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <blockquote className="mt-4 text-sm leading-7 text-muted-foreground">
                    &ldquo;{isAr ? testimonial.quoteAr || testimonial.quote : testimonial.quote}&rdquo;
                  </blockquote>
                  <div className="mt-5 flex items-center gap-3 border-t border-border/60 pt-4">
                    {testimonial.avatar ? (
                      <img src={testimonial.avatar} alt="" className="h-11 w-11 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/[0.08] text-sm font-semibold text-primary">
                        {(isAr ? testimonial.nameAr || testimonial.name : testimonial.name).charAt(0)}
                      </div>
                    )}
                    <div>
                      <div className="text-sm font-semibold text-foreground">{isAr ? testimonial.nameAr || testimonial.name : testimonial.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {isAr ? testimonial.designationAr || testimonial.designation : testimonial.designation}
                        {(testimonial.company || testimonial.companyAr) && (
                          <>, {isAr ? testimonial.companyAr || testimonial.company : testimonial.company}</>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {data?.recentPosts && data.recentPosts.length > 0 && (
        <section className="border-y border-border/60 bg-muted/20 py-10 lg:py-12">
          <div className="container mx-auto px-4 sm:px-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="heading-section font-semibold tracking-tight text-foreground">{t("blogHeading2")}</h2>
              </div>
              <Link href={`/${locale}/blog`}>
                <Button variant="outline">{t("visitBlog")}</Button>
              </Link>
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-3">
              {data.recentPosts.slice(0, 3).map((post) => (
                <Link key={post._id} href={`/${locale}/blog/${post.slug}`} className="group overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm transition-shadow hover:shadow-md">
                  {post.coverImage && <img src={post.coverImage} alt="" className="h-52 w-full object-cover" />}
                  <div className="p-6">
                    <h3 className="heading-subsection font-semibold tracking-tight text-foreground transition-colors group-hover:text-primary">
                      {isAr ? post.titleAr || post.title : post.title}
                    </h3>
                    <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">
                      {isAr ? post.excerptAr || post.excerpt : post.excerpt}
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {post.author && <span>{post.author}</span>}
                      {post.publishedAt && <span>{formatDate(new Date(post.publishedAt))}</span>}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {data?.faqs && data.faqs.length > 0 && (
        <section className="py-10 lg:py-12">
          <div className="container mx-auto max-w-4xl px-4 sm:px-6">
            <div className="mb-8 text-center">
              <h2 className="heading-section font-semibold tracking-tight text-foreground">{t("faqHeading2")}</h2>
            </div>

            <div className="space-y-3">
              {data.faqs.slice(0, 6).map((faq) => {
                const isOpen = openFaq === faq._id;

                return (
                  <div key={faq._id} className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
                    <button
                      type="button"
                      onClick={() => setOpenFaq(isOpen ? null : faq._id)}
                      aria-expanded={isOpen}
                      aria-controls={`landing-faq-${faq._id}`}
                      className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                    >
                      <span className="text-sm font-semibold text-foreground sm:text-base">
                        {isAr ? faq.questionAr || faq.question : faq.question}
                      </span>
                      {isOpen ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
                    </button>
                    {isOpen && (
                      <div id={`landing-faq-${faq._id}`} className="border-t border-border/60 px-5 pb-5 pt-4 text-sm leading-6 text-muted-foreground">
                        {isAr ? faq.answerAr || faq.answer : faq.answer}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {data.faqs.length > 6 && (
              <div className="mt-6 text-center">
                <Link href={`/${locale}/faq`}>
                  <Button variant="outline">{t("viewAllFaqs2")}</Button>
                </Link>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="bg-[linear-gradient(135deg,hsl(var(--brand-blue-dark))_0%,hsl(var(--brand-blue))_100%)] py-12 lg:py-14">
        <div className="container mx-auto px-4 text-center sm:px-6">
          <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            {t("ctaHeading")}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-white/80">
            {t("ctaDescription")}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href={`/${locale}/jobs`}>
              <Button size="lg" variant="secondary">{t("browseJobs")}</Button>
            </Link>
            <Link href={`/${locale}/register`}>
              <Button size="lg" variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white">
                {t("createProfile")}
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
