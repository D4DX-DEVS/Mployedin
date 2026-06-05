"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
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
const COMPANY_ADDRESS = "MPLOYEDIN UK LTD, X2 Greenleaf Walk, Southall, UB1 1FR";
const SUPPORT_EMAIL = "support@mployedin.com";

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
  const t = useTranslations("footer");
  const year = new Date().getFullYear();
  const isEmbedded = variant === "embedded";

  const platformSection: FooterSection = {
    title: t("platform"),
    links: [
      { href: `/${locale}/jobs`, label: t("discoverJobs") },
      { href: `/${locale}/register`, label: t("buildProfile") },
      { href: `/${locale}/employer-register`, label: t("hiringSolutions") },
      { href: `/${locale}/login`, label: t("workspaceLogin") },
    ],
  };

  const resourcesSection: FooterSection = {
    title: t("resources"),
    links: [
      { href: `/${locale}/blog`, label: t("blogLink") },
      { href: `/${locale}/faq`, label: t("faqLink") },
      { href: `/${locale}/contact`, label: t("talkToUs") },
    ],
  };

  const companySection: FooterSection = {
    title: t("company"),
    links: [
      { href: `/${locale}/privacy`, label: t("privacy") },
      { href: `/${locale}/terms`, label: t("terms") },
      { href: `/${locale}/cookies`, label: t("cookies") },
      { href: `/${locale}/gdpr`, label: t("gdpr") },
      { href: `/${locale}/contact`, label: t("support") },
    ],
  };

  const linkSections = isEmbedded
    ? [platformSection, companySection]
    : [platformSection, resourcesSection, companySection];

  const platformHighlights = [
    t("aiMatching"),
    t("fasterScreening"),
    t("smarterHiring"),
  ];

  return (
    <footer
      data-testid="site-footer"
      className="border-t border-white/10 bg-[hsl(var(--brand-blue-dark))] text-white"
    >
      <div className={`container mx-auto px-4 sm:px-6 ${isEmbedded ? "py-6" : "py-8 lg:py-10"}`}>
        <div className={`grid gap-10 ${isEmbedded ? "lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]" : "lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]"}`}>
          <div className="space-y-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/55">
                {t("digitalPlatform")}
              </p>
              <Image src="/logo.png" alt="Mployedin" width={100} height={34} className="mt-3 h-auto w-[118px] object-contain brightness-0 invert" style={{ height: "auto" }} />
              <p className="mt-4 max-w-xl text-sm leading-6 text-white/72 sm:text-[15px]">
                {t("description")}
              </p>
            </div>

            {!isEmbedded && (
              <ul className="flex flex-wrap gap-2" role="list">
                {platformHighlights.map((highlight) => (
                  <li
                    key={highlight}
                    className="rounded-full border border-white/12 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-white/78"
                  >
                    {highlight}
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={`/${locale}/jobs`}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-[hsl(var(--brand-blue-dark))] transition-transform hover:-translate-y-0.5"
              >
                {t("browseJobs")}
                <ArrowRight className="h-4 w-4" />
              </Link>
              {!isEmbedded && (
                <Link
                  href={`/${locale}/employer-register`}
                  className="inline-flex h-10 items-center rounded-full border border-white/18 px-4 text-sm font-semibold text-white transition-colors hover:bg-white/10"
                >
                  {t("forEmployers")}
                </Link>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)]">
              <div className="flex min-w-0 gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-white/80" />
                <p className="text-sm leading-6 text-white/74">
                  {COMPANY_ADDRESS}
                </p>
              </div>
              <div className="flex min-w-0 gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-white/80" />
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="min-w-0 text-sm leading-6 text-white/74 transition-colors [overflow-wrap:anywhere] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  {SUPPORT_EMAIL}
                </a>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span id={`footer-social-${locale}-${variant}`} className="text-sm font-medium text-white/78">
                {t("followUs")}
              </span>
              <nav aria-labelledby={`footer-social-${locale}-${variant}`} className="flex items-center gap-3">
                <a
                  href={WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="WhatsApp"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[rgba(37,211,102,0.38)] bg-white/[0.04] text-[#25D366] transition-all duration-200 hover:-translate-y-0.5 hover:border-[rgba(37,211,102,0.6)] hover:bg-[rgba(37,211,102,0.12)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  <WhatsAppIcon className="h-5 w-5" />
                </a>
                <a
                  href={INSTAGRAM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Instagram"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[rgba(247,119,55,0.34)] bg-white/[0.04] text-white transition-all duration-200 hover:-translate-y-0.5 hover:border-[rgba(247,119,55,0.6)] hover:bg-[linear-gradient(135deg,rgba(64,93,230,0.12),rgba(225,48,108,0.16),rgba(252,176,69,0.18))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  <InstagramIcon className="h-5 w-5" />
                </a>
              </nav>
            </div>
          </div>

          <div className={`grid gap-8 ${isEmbedded ? "sm:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-3"}`}>
            {linkSections.map((section) => (
              <div key={section.title}>
                <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-white/58">{section.title}</h3>
                <ul className="mt-4 space-y-2.5">
                  {section.links.map((link) => (
                    <li key={`${section.title}-${link.href}`}>
                      <Link href={link.href} className="text-sm leading-6 text-white/72 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 border-t border-white/10 pt-4 text-sm text-white/60 sm:flex-row sm:items-center sm:justify-between">
          <p>
            &copy; {year} MPLOYEDIN. {t("allRights")}
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link href={`/${locale}/privacy`} className="transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              {t("privacy")}
            </Link>
            <Link href={`/${locale}/terms`} className="transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              {t("terms")}
            </Link>
            <Link href={`/${locale}/cookies`} className="transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              {t("cookies")}
            </Link>
            <Link href={`/${locale}/gdpr`} className="transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              {t("gdpr")}
            </Link>
            <Link href={`/${locale}/contact`} className="transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              {t("support")}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
