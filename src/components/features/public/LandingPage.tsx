"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Play,
  Star,
  Briefcase,
  Users,
  Globe,
  Zap,
  ChevronDown,
  ChevronUp,
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
  const locale = pathname.split("/")[1] || "en";
  const isAr = locale === "ar";
  const t = (en: string, ar: string) => (isAr ? ar : en);

  const [data, setData] = useState<LandingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [bannerIndex, setBannerIndex] = useState(0);
  const [openFaq, setOpenFaq] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/public/landing")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Auto-rotate banners
  const banners = data?.banners ?? [];
  const nextBanner = useCallback(() => {
    if (banners.length > 1) {
      setBannerIndex((prev) => (prev + 1) % banners.length);
    }
  }, [banners.length]);

  useEffect(() => {
    if (banners.length <= 1) return;
    const timer = setInterval(nextBanner, 5000);
    return () => clearInterval(timer);
  }, [banners.length, nextBanner]);

  const prevBanner = () => setBannerIndex((prev) => (prev - 1 + banners.length) % banners.length);

  /** Converts YouTube/Vimeo URL to embed URL */
  const getEmbedUrl = (url: string) => {
    // YouTube
    const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;
    // Vimeo
    const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
    if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
    return url;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* ═══ Hero / Banner Slider ═══ */}
      {banners.length > 0 ? (
        <section className="relative overflow-hidden bg-gradient-to-br from-primary/5 to-primary/10">
          <div className="relative h-[400px] sm:h-[500px] lg:h-[600px]">
            {banners.map((banner, idx) => (
              <div
                key={banner._id}
                className={`absolute inset-0 transition-opacity duration-700 ${idx === bannerIndex ? "opacity-100" : "opacity-0 pointer-events-none"}`}
              >
                {banner.image && (
                  <img
                    src={banner.image}
                    alt={isAr ? banner.titleAr : banner.title}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                )}
                <div className="absolute inset-0 bg-black/40" />
                <div className="relative flex h-full items-center">
                  <div className="container mx-auto px-4">
                    <div className="max-w-2xl text-white">
                      <h1 className="text-3xl font-bold sm:text-4xl lg:text-5xl leading-tight">
                        {isAr ? banner.titleAr || banner.title : banner.title}
                      </h1>
                      {(banner.subtitle || banner.subtitleAr) && (
                        <p className="mt-4 text-lg text-white/80 sm:text-xl">
                          {isAr ? banner.subtitleAr || banner.subtitle : banner.subtitle}
                        </p>
                      )}
                      {banner.linkUrl && (
                        <Link href={banner.linkUrl}>
                          <Button size="lg" className="mt-6">
                            {isAr ? banner.linkTextAr || banner.linkText || "اعرف المزيد" : banner.linkText || "Learn More"}
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {banners.length > 1 && (
              <>
                <button
                  onClick={prevBanner}
                  className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/20 p-2 backdrop-blur transition hover:bg-white/40"
                >
                  <ChevronLeft className="h-5 w-5 text-white" />
                </button>
                <button
                  onClick={nextBanner}
                  className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/20 p-2 backdrop-blur transition hover:bg-white/40"
                >
                  <ChevronRight className="h-5 w-5 text-white" />
                </button>
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                  {banners.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setBannerIndex(idx)}
                      className={`h-2 rounded-full transition-all ${idx === bannerIndex ? "w-8 bg-white" : "w-2 bg-white/50"}`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </section>
      ) : (
        /* Fallback Hero if no banners */
        <section className="bg-gradient-to-br from-primary/5 via-background to-primary/10 py-20 lg:py-32">
          <div className="container mx-auto px-4 text-center">
            <h1 className="text-4xl font-bold sm:text-5xl lg:text-6xl">
              {t("AI-Powered Recruitment", "التوظيف المدعوم بالذكاء الاصطناعي")}
            </h1>
            <p className="mt-6 mx-auto max-w-2xl text-lg text-muted-foreground">
              {t(
                "Connect top talent with leading employers across the Gulf region. Smart matching, streamlined hiring.",
                "اربط أفضل المواهب بأبرز أصحاب العمل في منطقة الخليج. مطابقة ذكية، توظيف مبسط."
              )}
            </p>
            <div className="mt-8 flex gap-4 justify-center flex-wrap">
              <Link href={`/${locale}/register`}>
                <Button size="lg">{t("Get Started", "ابدأ الآن")}</Button>
              </Link>
              <Link href={`/${locale}/contact`}>
                <Button variant="outline" size="lg">{t("Contact Us", "اتصل بنا")}</Button>
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ═══ Features ═══ */}
      <section className="py-16 lg:py-24">
        <div className="container mx-auto px-4">
          <h2 className="text-center text-3xl font-bold mb-12">
            {t("Why Choose MPLOYEDIN?", "لماذا تختار مبلويدين؟")}
          </h2>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: <Zap className="h-8 w-8" />, title: t("AI Matching", "مطابقة ذكية"), desc: t("Smart algorithms match candidates with perfect job opportunities", "خوارزميات ذكية تطابق المرشحين مع فرص العمل المثالية") },
              { icon: <Globe className="h-8 w-8" />, title: t("Gulf Region Focus", "تركيز خليجي"), desc: t("Specialized in international recruitment for the Gulf market", "متخصصون في التوظيف الدولي لسوق الخليج") },
              { icon: <Users className="h-8 w-8" />, title: t("Agent Network", "شبكة الوكلاء"), desc: t("Large network of verified recruitment agents worldwide", "شبكة واسعة من وكلاء التوظيف المعتمدين حول العالم") },
              { icon: <Briefcase className="h-8 w-8" />, title: t("Top Employers", "أفضل أصحاب العمل"), desc: t("Connect with leading companies across multiple industries", "تواصل مع الشركات الرائدة عبر صناعات متعددة") },
            ].map((feature, idx) => (
              <div key={idx} className="rounded-xl border bg-card p-6 text-center transition-shadow hover:shadow-md">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  {feature.icon}
                </div>
                <h3 className="font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ Videos ═══ */}
      {data?.videos && data.videos.length > 0 && (
        <section className="bg-muted/30 py-16 lg:py-24">
          <div className="container mx-auto px-4">
            <h2 className="text-center text-3xl font-bold mb-12">
              {t("See How It Works", "شاهد كيف يعمل")}
            </h2>
            <div className={`grid gap-6 ${data.videos.length === 1 ? "max-w-3xl mx-auto" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
              {data.videos.map((video) => (
                <div key={video._id} className="rounded-xl overflow-hidden border bg-card">
                  <div className="aspect-video">
                    <iframe
                      src={getEmbedUrl(video.url)}
                      title={isAr ? video.titleAr || video.title : video.title}
                      className="h-full w-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold">{isAr ? video.titleAr || video.title : video.title}</h3>
                    {(video.description || video.descriptionAr) && (
                      <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
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

      {/* ═══ Testimonials ═══ */}
      {data?.testimonials && data.testimonials.length > 0 && (
        <section className="py-16 lg:py-24">
          <div className="container mx-auto px-4">
            <h2 className="text-center text-3xl font-bold mb-12">
              {t("What Our Users Say", "ماذا يقول مستخدمونا")}
            </h2>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {data.testimonials.map((testimonial) => (
                <div key={testimonial._id} className="rounded-xl border bg-card p-6 transition-shadow hover:shadow-md">
                  <div className="flex gap-1 mb-4">
                    {Array.from({ length: testimonial.rating }).map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    ))}
                  </div>
                  <blockquote className="text-sm text-muted-foreground leading-relaxed mb-4">
                    &ldquo;{isAr ? testimonial.quoteAr || testimonial.quote : testimonial.quote}&rdquo;
                  </blockquote>
                  <div className="flex items-center gap-3 border-t pt-4">
                    {testimonial.avatar ? (
                      <img src={testimonial.avatar} alt="" className="h-10 w-10 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">
                        {(isAr ? testimonial.nameAr || testimonial.name : testimonial.name).charAt(0)}
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-semibold">
                        {isAr ? testimonial.nameAr || testimonial.name : testimonial.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {isAr ? testimonial.designationAr || testimonial.designation : testimonial.designation}
                        {(testimonial.company || testimonial.companyAr) && (
                          <>, {isAr ? testimonial.companyAr || testimonial.company : testimonial.company}</>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ═══ Recent Blog Posts ═══ */}
      {data?.recentPosts && data.recentPosts.length > 0 && (
        <section className="bg-muted/30 py-16 lg:py-24">
          <div className="container mx-auto px-4">
            <div className="flex items-center justify-between mb-12">
              <h2 className="text-3xl font-bold">{t("Latest from Blog", "أحدث المقالات")}</h2>
              <Link href={`/${locale}/blog`}>
                <Button variant="outline">{t("View All", "عرض الكل")}</Button>
              </Link>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {data.recentPosts.slice(0, 3).map((post) => (
                <Link key={post._id} href={`/${locale}/blog/${post.slug}`} className="group">
                  <div className="rounded-xl border bg-card overflow-hidden transition-shadow group-hover:shadow-md">
                    {post.coverImage && (
                      <img src={post.coverImage} alt="" className="h-48 w-full object-cover" />
                    )}
                    <div className="p-5">
                      <h3 className="font-semibold group-hover:text-primary transition-colors line-clamp-2">
                        {isAr ? post.titleAr || post.title : post.title}
                      </h3>
                      <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                        {isAr ? post.excerptAr || post.excerpt : post.excerpt}
                      </p>
                      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                        {post.author && <span>{post.author}</span>}
                        {post.publishedAt && (
                          <>
                            {post.author && <span>•</span>}
                            <span>{new Date(post.publishedAt).toLocaleDateString()}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ═══ FAQ Section ═══ */}
      {data?.faqs && data.faqs.length > 0 && (
        <section className="py-16 lg:py-24">
          <div className="container mx-auto px-4 max-w-3xl">
            <h2 className="text-center text-3xl font-bold mb-12">
              {t("Frequently Asked Questions", "الأسئلة الشائعة")}
            </h2>
            <div className="space-y-3">
              {data.faqs.slice(0, 8).map((faq) => (
                <div key={faq._id} className="rounded-lg border bg-card">
                  <button
                    onClick={() => setOpenFaq(openFaq === faq._id ? null : faq._id)}
                    className="flex w-full items-center justify-between p-4 text-left"
                  >
                    <span className="font-medium pr-4">
                      {isAr ? faq.questionAr || faq.question : faq.question}
                    </span>
                    {openFaq === faq._id ? (
                      <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                  </button>
                  {openFaq === faq._id && (
                    <div className="border-t px-4 pb-4 pt-3 text-sm text-muted-foreground leading-relaxed">
                      {isAr ? faq.answerAr || faq.answer : faq.answer}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {data.faqs.length > 8 && (
              <div className="text-center mt-6">
                <Link href={`/${locale}/faq`}>
                  <Button variant="outline">{t("View All FAQs", "عرض الكل")}</Button>
                </Link>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ═══ CTA Section ═══ */}
      <section className="bg-primary py-16 lg:py-20">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-primary-foreground sm:text-4xl">
            {t("Ready to Transform Your Hiring?", "هل أنت مستعد لتحويل عملية التوظيف؟")}
          </h2>
          <p className="mt-4 text-lg text-primary-foreground/80 max-w-2xl mx-auto">
            {t(
              "Join thousands of employers and job seekers already using MPLOYEDIN to find the perfect match.",
              "انضم إلى آلاف أصحاب العمل والباحثين عن عمل الذين يستخدمون مبلويدين بالفعل."
            )}
          </p>
          <div className="mt-8 flex gap-4 justify-center flex-wrap">
            <Link href={`/${locale}/register`}>
              <Button size="lg" variant="secondary">
                {t("Sign Up Free", "سجل مجاناً")}
              </Button>
            </Link>
            <Link href={`/${locale}/employer-register`}>
              <Button size="lg" variant="outline" className="bg-transparent text-primary-foreground border-primary-foreground/30 hover:bg-primary-foreground/10">
                {t("Post a Job", "أعلن عن وظيفة")}
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
