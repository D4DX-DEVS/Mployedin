"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Briefcase,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Globe,
  MapPin,
  Play,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";

interface Banner {
  _id: string;
  title: string;
  titleAr: string;
  subtitle: string;
  subtitleAr: string;
  image: string;
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
  const t = (en: string, ar: string) => (isAr ? ar : en);

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
    t("Engineering jobs", "وظائف الهندسة"),
    t("Hospitality roles", "وظائف الضيافة"),
    t("Sales jobs", "وظائف المبيعات"),
    t("Remote jobs", "وظائف عن بعد"),
    t("Supply chain", "سلسلة الإمداد"),
  ];

  const functionalAreas = [
    t("Hardware", "الأجهزة والمعدات"),
    t("Sales & Business Development", "المبيعات وتطوير الأعمال"),
    t("Architects & Construction", "العمارة والإنشاء"),
    t("Maintenance/Repair", "الصيانة والإصلاح"),
    t("Restaurant Management", "إدارة المطاعم"),
    t("Supply Chain", "سلسلة الإمداد"),
    t("Accounts & Finance", "الحسابات والمالية"),
    t("Research & Development", "البحث والتطوير"),
  ];

  const industries = [
    t("Recruitment/Employment Firms", "شركات التوظيف"),
    t("Engineering", "الهندسة"),
    t("Textiles/Garments", "المنسوجات والملابس"),
    t("Event Management", "إدارة الفعاليات"),
    t("Advertising/PR", "الإعلان والعلاقات العامة"),
    t("FMCG", "السلع الاستهلاكية"),
    t("Hospitality", "الضيافة"),
    t("Retail", "التجزئة"),
  ];

  const valueProps = [
    {
      icon: Search,
      title: t("Jobs-first discovery", "اكتشاف وظائف أولاً"),
      description: t(
        "Search by role, skill, employer, or location and move from browsing to applying faster.",
        "ابحث حسب الوظيفة أو المهارة أو الشركة أو الموقع وانتقل من التصفح إلى التقديم بسرعة."
      ),
    },
    {
      icon: Sparkles,
      title: t("AI-guided matching", "مطابقة مدعومة بالذكاء الاصطناعي"),
      description: t(
        "Profiles, preferences, and recruiter signals help surface stronger-fit opportunities.",
        "يساعد ملفك وتفضيلاتك وإشارات أصحاب العمل على إظهار فرص أكثر ملاءمة."
      ),
    },
    {
      icon: Globe,
      title: t("Built for Gulf hiring", "مصمم للتوظيف في الخليج"),
      description: t(
        "A focused platform for employers and talent hiring across the Gulf region.",
        "منصة مركزة لأصحاب العمل والمواهب الباحثة عن فرص في منطقة الخليج."
      ),
    },
    {
      icon: ShieldCheck,
      title: t("Trust-ready profiles", "ملفات موثوقة وجاهزة"),
      description: t(
        "Showcase your skills, CV, and experience in one recruiter-friendly profile.",
        "اعرض مهاراتك وسيرتك الذاتية وخبراتك في ملف واحد واضح لأصحاب العمل."
      ),
    },
  ];

  const actionCards = [
    {
      icon: Briefcase,
      title: t("Find jobs that fit your profile", "اعثر على وظائف تناسب ملفك"),
      description: t(
        "Explore fresh opportunities across engineering, hospitality, sales, logistics, and more.",
        "استكشف فرصاً حديثة في الهندسة والضيافة والمبيعات واللوجستيات والمزيد."
      ),
      href: `/${locale}/jobs`,
      cta: t("Browse all jobs", "تصفح جميع الوظائف"),
    },
    {
      icon: Users,
      title: t("Build a stronger candidate profile", "أنشئ ملفاً مرشحاً أقوى"),
      description: t(
        "Register, upload your CV, and start receiving higher-signal job recommendations.",
        "سجل وارفع سيرتك الذاتية وابدأ في تلقي توصيات وظائف أكثر دقة."
      ),
      href: `/${locale}/register`,
      cta: t("Create profile", "أنشئ ملفك"),
    },
    {
      icon: Building2,
      title: t("Hire international talent faster", "وظف المواهب الدولية أسرع"),
      description: t(
        "Employers can post roles, review candidates, and scale hiring from one workspace.",
        "يمكن لأصحاب العمل نشر الوظائف ومراجعة المرشحين وتوسيع التوظيف من مساحة واحدة."
      ),
      href: `/${locale}/employer-register`,
      cta: t("Post a job", "أعلن عن وظيفة"),
    },
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
      <section className="relative border-b border-border/60 bg-[radial-gradient(circle_at_top_left,hsl(var(--brand-blue-pale))_0%,rgba(255,255,255,0)_38%),linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--surface-2))_100%)]">
        <div className="absolute inset-x-0 top-0 h-24 bg-[linear-gradient(180deg,hsl(var(--brand-blue-dark))/0.08,transparent)]" />
        <div className="container relative mx-auto px-4 py-10 sm:px-6 lg:py-16">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] lg:items-start">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-primary shadow-sm backdrop-blur">
                <Zap className="h-3.5 w-3.5" />
                {t("Smart Gulf hiring", "توظيف ذكي للخليج")}
              </div>

              <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-6xl lg:leading-[1.02]">
                {t(
                  "Find better-fit jobs, faster, with a home page built for active job seekers.",
                  "اعثر على وظائف أنسب وأسرع من خلال صفحة رئيسية مصممة للباحثين عن عمل."
                )}
              </h1>

              <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                {t(
                  "Search live roles across the Gulf, build a stronger profile, and move from discovery to application with clearer signals and smarter recommendations.",
                  "ابحث في الوظائف الحية عبر الخليج، وابنِ ملفاً أقوى، وانتقل من الاكتشاف إلى التقديم بإشارات أوضح وتوصيات أذكى."
                )}
              </p>

              <form onSubmit={handleSearch} className="mt-8 rounded-[28px] border border-border/70 bg-white p-3 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)_auto]">
                  <label className="flex min-h-14 items-center gap-3 rounded-[20px] border border-border/70 px-4">
                    <Search className="h-4 w-4 text-primary" />
                    <input
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      placeholder={t("Job title, skill, or company", "المسمى الوظيفي أو المهارة أو الشركة")}
                      className="h-full w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    />
                  </label>

                  <label className="flex min-h-14 items-center gap-3 rounded-[20px] border border-border/70 px-4">
                    <MapPin className="h-4 w-4 text-primary" />
                    <input
                      value={locationTerm}
                      onChange={(event) => setLocationTerm(event.target.value)}
                      placeholder={t("Country or city", "الدولة أو المدينة")}
                      className="h-full w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    />
                  </label>

                  <Button type="submit" className="h-14 rounded-[20px] px-6 text-sm font-semibold">
                    {t("Find jobs", "ابحث عن وظائف")}
                  </Button>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    {t("Popular searches", "عمليات البحث الشائعة")}
                  </span>
                  {quickSearches.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => router.push(`/${locale}/jobs?search=${encodeURIComponent(item)}`)}
                      className="rounded-full border border-border/70 bg-muted/30 px-3 py-1.5 text-sm text-foreground transition-colors hover:border-primary/25 hover:text-primary"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </form>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[24px] border border-border/60 bg-white/80 p-4 shadow-sm">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{t("Search", "البحث")}</div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {t("Explore Gulf roles by skill, location, and employer.", "استكشف وظائف الخليج حسب المهارة والموقع والشركة.")}
                  </p>
                </div>
                <div className="rounded-[24px] border border-border/60 bg-white/80 p-4 shadow-sm">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{t("Profile", "الملف الشخصي")}</div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {t("Create a profile recruiters can review quickly and trust.", "أنشئ ملفاً يسهل على أصحاب العمل مراجعته والثقة به.")}
                  </p>
                </div>
                <div className="rounded-[24px] border border-border/60 bg-white/80 p-4 shadow-sm">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{t("Apply", "التقديم")}</div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {t("Move from discovery to application with fewer dead ends.", "انتقل من الاكتشاف إلى التقديم مع عوائق أقل.")}
                  </p>
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="rounded-[32px] border border-border/70 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.12)]">
                <div className="relative overflow-hidden rounded-[24px] bg-[linear-gradient(140deg,hsl(var(--brand-blue-dark))_0%,hsl(var(--brand-blue))_62%,hsl(var(--brand-blue-light))_140%)] p-5 text-white">
                  <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-white/10 blur-3xl" />
                  <div className="absolute bottom-0 left-0 h-28 w-28 rounded-full bg-white/10 blur-2xl" />
                  <div className="relative">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.24em] text-white/70">
                          {t("Featured campaign", "حملة مميزة")}
                        </div>
                        <h2 className="mt-2 text-2xl font-semibold leading-tight">
                          {activeBanner
                            ? isAr
                              ? activeBanner.titleAr || activeBanner.title
                              : activeBanner.title
                            : t("A smarter way to discover your next role.", "طريقة أذكى لاكتشاف وظيفتك القادمة.")}
                        </h2>
                      </div>
                      {banners.length > 1 && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={prevBanner}
                            aria-label={t("Previous banner", "الشريحة السابقة")}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 transition-colors hover:bg-white/20"
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={nextBanner}
                            aria-label={t("Next banner", "الشريحة التالية")}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 transition-colors hover:bg-white/20"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>

                    <p className="mt-4 max-w-md text-sm leading-6 text-white/80">
                      {activeBanner
                        ? isAr
                          ? activeBanner.subtitleAr || activeBanner.subtitle
                          : activeBanner.subtitle
                        : t(
                            "Use your profile, CV, and preferences to uncover roles that are easier to act on.",
                            "استخدم ملفك وسيرتك الذاتية وتفضيلاتك لاكتشاف فرص يسهل التقدم لها."
                          )}
                    </p>

                    <div className="mt-6 overflow-hidden rounded-[22px] border border-white/15 bg-white/10">
                      {activeBanner?.image ? (
                        <img
                          src={activeBanner.image}
                          alt={isAr ? activeBanner.titleAr || activeBanner.title : activeBanner.title}
                          className="h-56 w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-56 items-center justify-center bg-white/5 px-6 text-center text-sm text-white/75">
                          {t(
                            "Live hiring campaigns, job discovery, and profile setup all start here.",
                            "هنا تبدأ حملات التوظيف الحية واكتشاف الوظائف وإعداد الملف الشخصي."
                          )}
                        </div>
                      )}
                    </div>

                    <div className="mt-5 flex flex-wrap items-center gap-3">
                      <Link
                        href={activeBanner?.linkUrl || `/${locale}/jobs`}
                        className="inline-flex h-11 items-center rounded-full bg-white px-5 text-sm font-semibold text-[hsl(var(--brand-blue-dark))]"
                      >
                        {activeBanner
                          ? isAr
                            ? activeBanner.linkTextAr || activeBanner.linkText || t("Explore now", "استكشف الآن")
                            : activeBanner.linkText || t("Explore now", "استكشف الآن")
                          : t("Explore jobs", "استكشف الوظائف")}
                      </Link>
                      <Link
                        href={`/${locale}/register`}
                        className="inline-flex h-11 items-center rounded-full border border-white/20 px-5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
                      >
                        {t("Create your candidate profile", "أنشئ ملفك المرشح")}
                      </Link>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[22px] border border-border/70 bg-muted/20 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{t("Market focus", "تركيز السوق")}</div>
                    <div className="mt-2 text-sm font-medium text-foreground">{t("Gulf hiring markets", "أسواق التوظيف في الخليج")}</div>
                  </div>
                  <div className="rounded-[22px] border border-border/70 bg-muted/20 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{t("Hiring teams", "فرق التوظيف")}</div>
                    <div className="mt-2 text-sm font-medium text-foreground">{t("Employers and recruiters", "أصحاب العمل ووكلاء التوظيف")}</div>
                  </div>
                  <div className="rounded-[22px] border border-border/70 bg-muted/20 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{t("Candidate flow", "رحلة المرشح")}</div>
                    <div className="mt-2 text-sm font-medium text-foreground">{t("Search, profile, apply", "ابحث، أنشئ ملفك، قدّم")}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-20">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">{t("Get moving quickly", "ابدأ بسرعة")}</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                {t("Choose the path that matches where you are right now.", "اختر المسار الذي يناسب مرحلتك الحالية الآن.")}
              </h2>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              {t(
                "The homepage should help job seekers act immediately: search live jobs, strengthen their profile, or enter as an employer without hunting through navigation.",
                "يجب أن تساعد الصفحة الرئيسية الباحثين عن عمل على التصرف فوراً: البحث عن وظائف أو تقوية الملف الشخصي أو الدخول كصاحب عمل دون التنقل الطويل."
              )}
            </p>
          </div>

          <div className="mt-8 grid gap-5 lg:grid-cols-3">
            {actionCards.map((card) => {
              const Icon = card.icon;

              return (
                <Link
                  key={card.title}
                  href={card.href}
                  className="group rounded-[28px] border border-border/70 bg-white p-6 shadow-[0_12px_40px_rgba(15,23,42,0.05)] transition-all hover:-translate-y-1 hover:border-primary/25 hover:shadow-[0_20px_48px_rgba(15,23,42,0.08)]"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-primary/[0.08] text-primary">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-5 text-xl font-semibold tracking-tight text-foreground">{card.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{card.description}</p>
                  <div className="mt-6 text-sm font-semibold text-primary">{card.cta}</div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-y border-border/60 bg-muted/20 py-16 lg:py-20">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_320px] xl:items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">{t("Browse by category", "تصفح حسب الفئة")}</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{t("Jobs by functional area", "الوظائف حسب المجال")}</h2>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {functionalAreas.map((item) => (
                  <Link
                    key={item}
                    href={`/${locale}/jobs?search=${encodeURIComponent(item)}`}
                    className="rounded-[20px] border border-border/70 bg-white px-4 py-3 text-sm font-medium text-foreground transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:text-primary"
                  >
                    {item}
                  </Link>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">{t("Explore by market", "استكشف حسب السوق")}</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{t("Jobs by industry", "الوظائف حسب القطاع")}</h2>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {industries.map((item) => (
                  <Link
                    key={item}
                    href={`/${locale}/jobs?search=${encodeURIComponent(item)}`}
                    className="rounded-[20px] border border-border/70 bg-white px-4 py-3 text-sm font-medium text-foreground transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:text-primary"
                  >
                    {item}
                  </Link>
                ))}
              </div>
            </div>

            <div className="rounded-[30px] border border-primary/15 bg-[linear-gradient(160deg,hsl(var(--brand-blue-dark))_0%,hsl(var(--brand-blue))_100%)] p-6 text-white shadow-[0_18px_50px_rgba(15,23,42,0.18)]">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/65">{t("Why this home page", "لماذا هذه الصفحة")}</p>
              <h3 className="mt-3 text-2xl font-semibold tracking-tight">{t("A clearer front door for job seekers.", "مدخل أوضح للباحثين عن عمل.")}</h3>
              <p className="mt-4 text-sm leading-6 text-white/80">
                {t(
                  "Bayt-style structure works because it lets users search, browse categories, and trust the platform quickly. This redesign keeps that clarity while fitting MPLOYEDIN's brand.",
                  "يعمل هذا الأسلوب لأنه يتيح للمستخدم البحث والتصفح وبناء الثقة بسرعة. ويحتفظ هذا التصميم بالوضوح مع هوية مبلويدين."
                )}
              </p>
              <Link
                href={`/${locale}/jobs`}
                className="mt-6 inline-flex h-11 items-center rounded-full bg-white px-5 text-sm font-semibold text-[hsl(var(--brand-blue-dark))]"
              >
                {t("Explore open positions", "استكشف الوظائف المتاحة")}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-20">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="mb-8 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">{t("Built around real actions", "مبني حول الإجراءات الحقيقية")}</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              {t("Why job seekers stay on MPLOYEDIN.", "لماذا يستمر الباحثون عن عمل مع مبلويدين.")}
            </h2>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {valueProps.map((item) => {
              const Icon = item.icon;

              return (
                <div key={item.title} className="rounded-[28px] border border-border/70 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.04)]">
                  <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-primary/[0.08] text-primary">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-foreground">{item.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {data?.videos && data.videos.length > 0 && (
        <section className="border-y border-border/60 bg-muted/20 py-16 lg:py-20">
          <div className="container mx-auto px-4 sm:px-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">{t("See the platform", "شاهد المنصة")}</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{t("Learn the workflow in minutes.", "تعرّف على سير العمل في دقائق.")}</h2>
              </div>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                {t(
                  "Short explainer videos give job seekers and employers a quicker sense of how to get value from the platform.",
                  "تمنح مقاطع الفيديو القصيرة الباحثين عن عمل وأصحاب العمل فهماً أسرع لكيفية الاستفادة من المنصة."
                )}
              </p>
            </div>

            <div className={`mt-8 grid gap-6 ${data.videos.length === 1 ? "max-w-4xl" : "lg:grid-cols-2 xl:grid-cols-3"}`}>
              {data.videos.slice(0, 3).map((video) => (
                <div key={video._id} className="overflow-hidden rounded-[28px] border border-border/70 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.05)]">
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
                      {t("Watch", "شاهد")}
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
        <section className="py-16 lg:py-20">
          <div className="container mx-auto px-4 sm:px-6">
            <div className="mb-8 text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">{t("Social proof", "آراء المستخدمين")}</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{t("What users say after switching to MPLOYEDIN.", "ماذا يقول المستخدمون بعد الانتقال إلى مبلويدين.")}</h2>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              {data.testimonials.slice(0, 3).map((testimonial) => (
                <div key={testimonial._id} className="rounded-[28px] border border-border/70 bg-white p-6 shadow-[0_12px_40px_rgba(15,23,42,0.05)]">
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
        <section className="border-y border-border/60 bg-muted/20 py-16 lg:py-20">
          <div className="container mx-auto px-4 sm:px-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">{t("Career content", "محتوى مهني")}</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{t("Advice, updates, and market context.", "نصائح وتحديثات وسياق السوق.")}</h2>
              </div>
              <Link href={`/${locale}/blog`}>
                <Button variant="outline">{t("Visit blog", "زر المدونة")}</Button>
              </Link>
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-3">
              {data.recentPosts.slice(0, 3).map((post) => (
                <Link key={post._id} href={`/${locale}/blog/${post.slug}`} className="group overflow-hidden rounded-[28px] border border-border/70 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.05)] transition-shadow hover:shadow-[0_18px_44px_rgba(15,23,42,0.08)]">
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
        <section className="py-16 lg:py-20">
          <div className="container mx-auto max-w-4xl px-4 sm:px-6">
            <div className="mb-8 text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">{t("Questions", "الأسئلة")}</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{t("Frequently asked questions.", "الأسئلة الشائعة.")}</h2>
            </div>

            <div className="space-y-3">
              {data.faqs.slice(0, 6).map((faq) => {
                const isOpen = openFaq === faq._id;

                return (
                  <div key={faq._id} className="overflow-hidden rounded-[22px] border border-border/70 bg-white shadow-sm">
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
                  <Button variant="outline">{t("View all FAQs", "عرض جميع الأسئلة")}</Button>
                </Link>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="bg-[linear-gradient(135deg,hsl(var(--brand-blue-dark))_0%,hsl(var(--brand-blue))_100%)] py-16 lg:py-20">
        <div className="container mx-auto px-4 text-center sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/65">{t("Final step", "الخطوة الأخيرة")}</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            {t("Start with the path that gets you hired faster.", "ابدأ بالمسار الذي يقربك من التوظيف بشكل أسرع.")}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-white/80">
            {t(
              "Whether you want to search jobs, build a stronger profile, or hire internationally, the homepage now gives each audience a clear next step.",
              "سواء أردت البحث عن وظائف أو بناء ملف أقوى أو التوظيف دولياً، تمنحك الصفحة الرئيسية الآن خطوة واضحة تالية لكل فئة."
            )}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href={`/${locale}/jobs`}>
              <Button size="lg" variant="secondary">{t("Browse jobs", "تصفح الوظائف")}</Button>
            </Link>
            <Link href={`/${locale}/register`}>
              <Button size="lg" variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white">
                {t("Create profile", "أنشئ ملفك")}
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
