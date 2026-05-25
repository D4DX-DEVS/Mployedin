"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Briefcase,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  MapPin,
  Play,
  Search,
  Star,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";

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
  const [bannerIndex, setBannerIndex] = useState(0);
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [locationTerm, setLocationTerm] = useState("");

  useEffect(() => {
    fetch("/api/public/landing")
      .then((response) => response.json())
      .then((payload) => setData(payload))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

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
    if (banners.length <= 1) {
      return;
    }

    const timer = window.setInterval(nextBanner, 6500);
    return () => window.clearInterval(timer);
  }, [banners.length, nextBanner]);

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

  const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = [searchTerm.trim(), locationTerm.trim()].filter(Boolean).join(" ");
    const target = query ? `/${locale}/jobs?search=${encodeURIComponent(query)}` : `/${locale}/jobs`;
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

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-hidden">
      <section className="relative border-b border-border/60 bg-[radial-gradient(circle_at_top_left,hsl(var(--brand-blue-pale))_0%,transparent_38%),linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--surface-2))_100%)]">
        <div className="absolute inset-x-0 top-0 h-24 bg-[linear-gradient(180deg,hsl(var(--brand-blue-dark))/0.08,transparent)]" />
        <div className="container relative mx-auto px-4 py-10 sm:px-6 lg:py-14">
          <div className="mx-auto max-w-3xl text-center">
              <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-[3.5rem] lg:leading-[1.08]">
                {t("heroTitle")}
              </h1>

              <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
                {t("heroDescription")}
              </p>

              <form onSubmit={handleSearch} className="mx-auto mt-8 max-w-2xl rounded-2xl border border-border/70 bg-card p-3 shadow-[0_20px_60px_rgba(15,23,42,0.08)] dark:shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                  <label className="flex min-h-12 items-center gap-3 rounded-xl border border-border/70 px-4">
                    <Search className="h-4 w-4 shrink-0 text-primary" />
                    <input
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      placeholder={t("searchPlaceholder")}
                      className="h-full w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                    />
                  </label>

                  <label className="flex min-h-12 items-center gap-3 rounded-xl border border-border/70 px-4">
                    <MapPin className="h-4 w-4 shrink-0 text-primary" />
                    <input
                      value={locationTerm}
                      onChange={(event) => setLocationTerm(event.target.value)}
                      placeholder={t("locationPlaceholder")}
                      className="h-full w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                    />
                  </label>

                  <Button type="submit" className="h-12 rounded-xl px-6 text-sm font-semibold">
                    {t("findJobs2")}
                  </Button>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                  <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    {t("popularSearches")}
                  </span>
                  {quickSearches.map((item) => (
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

              <div className="mt-6 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
                <div className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">5,000+</span>
                  <span className="text-xs text-muted-foreground">{t("activeJobs")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">800+</span>
                  <span className="text-xs text-muted-foreground">{t("companiesHiring")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">50,000+</span>
                  <span className="text-xs text-muted-foreground">{t("registeredCandidates")}</span>
                </div>
              </div>

          </div>
        </div>
      </section>

      {/* Banner carousel — only shown when actual campaign banners exist */}
      {banners.length > 0 && (
        <section className="border-b border-border/60 bg-[linear-gradient(135deg,hsl(var(--brand-blue-dark))_0%,hsl(var(--brand-blue))_100%)] py-6">
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
                    <h3 className="truncate text-base font-semibold">
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
                    <button type="button" onClick={prevBanner} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-white hover:bg-white/10">
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={nextBanner} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-white hover:bg-white/10">
                      <ChevronRight className="h-4 w-4" />
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

      <section className="border-y border-border/60 bg-muted/20 py-10 lg:py-12">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_320px] xl:items-start">
            <div>
              <h2 className="text-xl font-semibold text-foreground">{t("jobsByFunctionalArea")}</h2>
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
              <h2 className="text-xl font-semibold text-foreground">{t("jobsByIndustry")}</h2>
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

            <div className="rounded-2xl border border-primary/15 bg-[linear-gradient(160deg,hsl(var(--brand-blue-dark))_0%,hsl(var(--brand-blue))_100%)] p-6 text-white shadow-[0_18px_50px_rgba(15,23,42,0.18)]">
              <h3 className="text-xl font-semibold">{t("hireFaster")}</h3>
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

      {data?.videos && data.videos.length > 0 && (
        <section className="border-y border-border/60 bg-muted/20 py-10 lg:py-12">
          <div className="container mx-auto px-4 sm:px-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">{t("learnWorkflow")}</h2>
              </div>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                {t("learnWorkflowDesc")}
              </p>
            </div>

            <div className={`mt-8 grid gap-6 ${data.videos.length === 1 ? "max-w-4xl" : "lg:grid-cols-2 xl:grid-cols-3"}`}>
              {data.videos.slice(0, 3).map((video) => (
                <div key={video._id} className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm dark:shadow-[0_4px_20px_rgba(0,0,0,0.15)]">
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
                    <h3 className="mt-4 text-lg font-semibold text-foreground">{isAr ? video.titleAr || video.title : video.title}</h3>
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
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">{t("testimonialHeading")}</h2>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              {data.testimonials.slice(0, 3).map((testimonial) => (
                <div key={testimonial._id} className="rounded-2xl border border-border/70 bg-card p-6 shadow-sm dark:shadow-[0_4px_20px_rgba(0,0,0,0.15)]">
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
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">{t("blogHeading2")}</h2>
              </div>
              <Link href={`/${locale}/blog`}>
                <Button variant="outline">{t("visitBlog")}</Button>
              </Link>
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-3">
              {data.recentPosts.slice(0, 3).map((post) => (
                <Link key={post._id} href={`/${locale}/blog/${post.slug}`} className="group overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm transition-shadow hover:shadow-md dark:shadow-[0_4px_20px_rgba(0,0,0,0.15)] dark:hover:shadow-[0_8px_28px_rgba(0,0,0,0.25)]">
                  {post.coverImage && <img src={post.coverImage} alt="" className="h-52 w-full object-cover" />}
                  <div className="p-6">
                    <h3 className="text-lg font-semibold tracking-tight text-foreground transition-colors group-hover:text-primary">
                      {isAr ? post.titleAr || post.title : post.title}
                    </h3>
                    <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">
                      {isAr ? post.excerptAr || post.excerpt : post.excerpt}
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {post.author && <span>{post.author}</span>}
                      {post.publishedAt && <span>{new Date(post.publishedAt).toLocaleDateString()}</span>}
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
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">{t("faqHeading2")}</h2>
            </div>

            <div className="space-y-3">
              {data.faqs.slice(0, 6).map((faq) => {
                const isOpen = openFaq === faq._id;

                return (
                  <div key={faq._id} className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
                    <button
                      type="button"
                      onClick={() => setOpenFaq(isOpen ? null : faq._id)}
                      className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                    >
                      <span className="text-sm font-semibold text-foreground sm:text-base">
                        {isAr ? faq.questionAr || faq.question : faq.question}
                      </span>
                      {isOpen ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
                    </button>
                    {isOpen && (
                      <div className="border-t border-border/60 px-5 pb-5 pt-4 text-sm leading-6 text-muted-foreground">
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
