"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Mail, MapPin } from "lucide-react";

type FooterVariant = "full" | "embedded";

interface PublicFooterProps {
  locale: string;
  variant?: FooterVariant;
}

type FooterLink = {
  href: string;
  label: string;
};

type FooterSection = {
  title: string;
  links: FooterLink[];
};

const WHATSAPP_URL = "https://whatsapp.com/channel/0029VaiIpxg2ER6cM4IX4D41";
const INSTAGRAM_URL = "https://www.instagram.com/mployedin_jobs?igsh=MTE1MzJob3p5ZDFhMA==";

type SocialIconProps = {
  className?: string;
};

function WhatsAppIcon({ className }: SocialIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M19.05 4.94A9.9 9.9 0 0 0 12 2a9.93 9.93 0 0 0-8.62 14.9L2 22l5.24-1.37A10 10 0 0 0 12 22a9.93 9.93 0 0 0 7.05-17.06ZM12 20.17a8.1 8.1 0 0 1-4.13-1.13l-.3-.18-3.11.81.83-3.03-.2-.31A8.1 8.1 0 1 1 12 20.17Zm4.44-6.05c-.24-.12-1.4-.69-1.62-.77-.22-.08-.38-.12-.54.12-.16.24-.62.77-.76.93-.14.16-.28.18-.52.06a6.6 6.6 0 0 1-1.94-1.2 7.3 7.3 0 0 1-1.34-1.67c-.14-.24-.02-.37.1-.5.1-.1.24-.26.36-.39.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.79-.2-.47-.4-.41-.54-.42h-.46a.9.9 0 0 0-.66.3c-.22.24-.86.84-.86 2.05 0 1.2.88 2.37 1 2.53.12.16 1.73 2.64 4.18 3.7.58.26 1.04.41 1.4.53.59.18 1.13.15 1.56.09.47-.07 1.4-.57 1.6-1.13.2-.56.2-1.03.14-1.13-.06-.1-.22-.16-.46-.28Z" />
    </svg>
  );
}

function InstagramIcon({ className }: SocialIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <rect x="3.25" y="3.25" width="17.5" height="17.5" rx="5.25" />
      <circle cx="12" cy="12" r="4.1" />
      <circle cx="17.35" cy="6.65" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export default function PublicFooter({ locale, variant = "full" }: PublicFooterProps) {
  const isAr = locale === "ar";
  const year = new Date().getFullYear();
  const isEmbedded = variant === "embedded";

  const quickLinks: FooterSection = {
    title: isAr ? "روابط سريعة" : "Quick Links",
    links: [
      { href: `/${locale}`, label: isAr ? "الرئيسية" : "Home" },
      { href: `/${locale}/jobs`, label: isAr ? "الوظائف" : "Browse Jobs" },
      { href: `/${locale}/contact`, label: isAr ? "اتصل بنا" : "Contact Us" },
      { href: `/${locale}/blog`, label: isAr ? "المدونة" : "Blog" },
      { href: `/${locale}/faq`, label: isAr ? "الأسئلة الشائعة" : "FAQ" },
      { href: `/${locale}/privacy`, label: isAr ? "سياسة الخصوصية" : "Privacy Policy" },
      { href: `/${locale}/cookies`, label: isAr ? "سياسة الكوكيز" : "Cookie Policy" },
    ],
  };

  const jobFunctions: FooterSection = {
    title: isAr ? "الوظائف حسب المجال" : "Jobs By Functional Area",
    links: [
      { href: `/${locale}/jobs?search=Hardware`, label: isAr ? "الأجهزة والمعدات" : "Hardware" },
      { href: `/${locale}/jobs?search=Sales%20Business%20Development`, label: isAr ? "المبيعات وتطوير الأعمال" : "Sales & Business Development" },
      { href: `/${locale}/jobs?search=Construction`, label: isAr ? "العمارة والإنشاء" : "Architects & Construction" },
      { href: `/${locale}/jobs?search=Maintenance`, label: isAr ? "الصيانة والإصلاح" : "Maintenance/Repair" },
      { href: `/${locale}/jobs?search=Restaurant`, label: isAr ? "إدارة المطاعم" : "Restaurant Management" },
      { href: `/${locale}/jobs?search=Supply%20Chain`, label: isAr ? "سلسلة الإمداد" : "Supply Chain" },
    ],
  };

  const industries: FooterSection = {
    title: isAr ? "الوظائف حسب القطاع" : "Jobs By Industry",
    links: [
      { href: `/${locale}/jobs?search=Recruitment`, label: isAr ? "شركات التوظيف" : "Recruitment/Employment Firms" },
      { href: `/${locale}/jobs?search=Engineering`, label: isAr ? "الهندسة" : "Engineering" },
      { href: `/${locale}/jobs?search=Textiles`, label: isAr ? "المنسوجات والملابس" : "Textiles/Garments" },
      { href: `/${locale}/jobs?search=Event%20Management`, label: isAr ? "إدارة الفعاليات" : "Event Management" },
      { href: `/${locale}/jobs?search=Advertising`, label: isAr ? "الإعلان والعلاقات العامة" : "Advertising/PR" },
      { href: `/${locale}/jobs?search=FMCG`, label: isAr ? "السلع الاستهلاكية سريعة الدوران" : "Fast Moving Consumer Goods" },
    ],
  };

  const careerLinks: FooterSection = {
    title: isAr ? "ابدأ الآن" : "Get Started",
    links: [
      { href: `/${locale}/register`, label: isAr ? "أنشئ ملفك" : "Create your profile" },
      { href: `/${locale}/login`, label: isAr ? "تسجيل الدخول" : "Login" },
      { href: `/${locale}/employer-register`, label: isAr ? "نشر وظيفة" : "Post a Job" },
      { href: `/${locale}/jobs`, label: isAr ? "استكشف الفرص" : "Explore opportunities" },
    ],
  };

  const linkSections = [quickLinks, jobFunctions, industries, careerLinks];

  return (
    <footer
      data-testid="site-footer"
      className="border-t border-white/10 bg-[hsl(var(--brand-blue-dark))] text-white"
    >
      {!isEmbedded && (
        <div className="border-b border-white/10 bg-[linear-gradient(135deg,hsl(var(--brand-blue))_0%,hsl(var(--brand-blue-dark))_55%,hsl(var(--brand-blue-dark))_100%)]">
          <div className="container mx-auto flex flex-col gap-6 px-4 py-10 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:py-12">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/65">
                {isAr ? "للباحثين عن عمل وأصحاب العمل" : "For Job Seekers And Employers"}
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                {isAr ? "ابدأ رحلتك المهنية التالية مع مبلويدين" : "Start your next Gulf-region opportunity with MPLOYEDIN"}
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-white/75 sm:text-base">
                {isAr
                  ? "اكتشف الوظائف المناسبة، طور ملفك الشخصي، وتواصل مع أصحاب العمل الذين يبحثون عن المواهب المناسبة الآن."
                  : "Discover better-fit roles, strengthen your profile, and connect with employers hiring across the Gulf right now."}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={`/${locale}/jobs`}
                className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-[hsl(var(--brand-blue-dark))] transition-transform hover:-translate-y-0.5"
              >
                {isAr ? "تصفح الوظائف" : "Browse Jobs"}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href={`/${locale}/register`}
                className="inline-flex h-11 items-center rounded-full border border-white/20 px-5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                {isAr ? "أنشئ ملفك" : "Create Profile"}
              </Link>
            </div>
          </div>
        </div>
      )}

      <div className="container mx-auto px-4 py-10 sm:px-6 lg:py-12">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)]">
          <div className="space-y-6">
            <div>
              <Image src="/logo.png" alt="Mployedin" width={156} height={42} className="h-10 w-auto object-contain brightness-0 invert" />
              <p className="mt-4 max-w-md text-sm leading-6 text-white/70">
                {isAr
                  ? "منصة توظيف عالمية مدعومة بالذكاء الاصطناعي تربط الباحثين عن عمل وأصحاب العمل بفرص أسرع وأكثر دقة في أسواق الخليج."
                  : "An AI-powered recruitment platform connecting job seekers and employers to faster, better-fit hiring across Gulf markets."}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <div className="min-w-0 rounded-[24px] border border-white/10 bg-white/5 p-4">
                <div className="flex min-w-0 items-start gap-3">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-white/80" />
                  <p className="text-sm leading-6 text-white/78">
                    MPLOYEDIN UK LTD X2 GREENLEAF WALK SOUTHALL, UB1 1FR
                  </p>
                </div>
              </div>
              <div className="min-w-0 rounded-[24px] border border-white/10 bg-white/5 p-4">
                <div className="flex min-w-0 items-start gap-3">
                  <Mail className="mt-0.5 h-4 w-4 shrink-0 text-white/80" />
                  <a
                    href="mailto:support@mployedin.com"
                    className="min-w-0 text-sm leading-6 text-white/78 transition-colors [overflow-wrap:anywhere] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  >
                    support@mployedin.com
                  </a>
                </div>
              </div>
            </div>

            <div>
              <div className="text-sm font-semibold text-white">{isAr ? "تابعنا" : "Follow Us"}</div>
              <div className="mt-3 flex items-center gap-3">
                <a
                  href={WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="WhatsApp"
                  className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[rgba(37,211,102,0.38)] bg-white/[0.04] text-[#25D366] shadow-[0_18px_45px_-30px_rgba(0,0,0,0.85)] backdrop-blur-sm transition-all duration-200 hover:-translate-y-1 hover:border-[rgba(37,211,102,0.6)] hover:bg-[rgba(37,211,102,0.12)] hover:shadow-[0_18px_40px_-24px_rgba(37,211,102,0.75)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  <WhatsAppIcon className="h-5 w-5" />
                </a>
                <a
                  href={INSTAGRAM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Instagram"
                  className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[rgba(247,119,55,0.34)] bg-white/[0.04] text-white shadow-[0_18px_45px_-30px_rgba(0,0,0,0.85)] backdrop-blur-sm transition-all duration-200 hover:-translate-y-1 hover:border-[rgba(247,119,55,0.6)] hover:bg-[linear-gradient(135deg,rgba(64,93,230,0.12),rgba(225,48,108,0.16),rgba(252,176,69,0.18))] hover:shadow-[0_18px_40px_-24px_rgba(225,48,108,0.7)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  <InstagramIcon className="h-5 w-5" />
                </a>
              </div>
            </div>
          </div>

          <div className="grid gap-8 sm:grid-cols-2 xl:grid-cols-4">
            {linkSections.map((section) => (
              <div key={section.title}>
                <h3 className="text-base font-semibold text-white">{section.title}</h3>
                <ul className="mt-4 space-y-3">
                  {section.links.map((link) => (
                    <li key={`${section.title}-${link.href}`}>
                      <Link href={link.href} className="text-sm leading-6 text-white/70 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-white/10 pt-5 text-sm text-white/60 sm:flex-row sm:items-center sm:justify-between">
          <p>
            &copy; {year} MPLOYEDIN. {isAr ? "جميع الحقوق محفوظة." : "All rights reserved."}
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link href={`/${locale}/privacy`} className="transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              {isAr ? "الخصوصية" : "Privacy"}
            </Link>
            <Link href={`/${locale}/cookies`} className="transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              {isAr ? "الكوكيز" : "Cookies"}
            </Link>
            <Link href={`/${locale}/contact`} className="transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              {isAr ? "الدعم" : "Support"}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
