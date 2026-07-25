"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
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

  // Render the support email only after mount so it never appears in the
  // server-rendered HTML. This prevents Cloudflare's "Email Address
  // Obfuscation" from rewriting it (which injects a CSP-blocked decode
  // script and triggers a React hydration mismatch, error #418).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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
      <div className={`container mx-auto px-4 sm:px-6 ${isEmbedded ? "py-5 sm:py-6" : "py-8 lg:py-10"}`}>
        {/* One row on desktop: brand block + link columns beside it. Everything
            that used to stack under the brand (address, email, socials) moved to
            the bottom bar — that vertical stack was the whole height problem. */}
        <div className={`grid gap-6 sm:gap-8 ${isEmbedded ? "sm:grid-cols-[minmax(0,1.5fr)_repeat(2,minmax(0,1fr))]" : "sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))]"}`}>
          <div className="space-y-4">
            <div>
              <p className={`text-[11px] font-semibold uppercase tracking-[0.28em] text-white/55 ${isEmbedded ? "hidden sm:block" : ""}`}>
                {t("digitalPlatform")}
              </p>
              <Image src="/logo.png" alt="Mployedin" width={100} height={34} className="mt-3 h-auto w-[118px] object-contain brightness-0 invert" style={{ height: "auto" }} />
              {/* The blurb is the bulk of the embedded footer's height on a
                  phone — dropped below sm, kept from sm up. */}
              <p className={`mt-3 max-w-sm text-sm leading-6 text-white/72 ${isEmbedded ? "hidden sm:block" : ""}`}>
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
          </div>

          {/* Inside the app shell on a phone these columns duplicate the bottom
              tab bar and the legal row below, so they only render from sm up. */}
          {linkSections.map((section) => (
            <div key={section.title} className={isEmbedded ? "hidden sm:block" : ""}>
              <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-white/58 sm:tracking-[0.22em]">{section.title}</h3>
              <ul className="mt-3 space-y-2">
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

        <div className="mt-6 flex flex-col gap-4 border-t border-white/10 pt-4 text-sm text-white/60 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-x-6 gap-y-2 sm:flex-row sm:items-center">
            <span className={`min-w-0 items-center gap-2 ${isEmbedded ? "hidden sm:inline-flex" : "inline-flex"}`}>
              <MapPin className="h-4 w-4 shrink-0 text-white/70" />
              {COMPANY_ADDRESS}
            </span>
            <span className="inline-flex min-w-0 items-center gap-2">
              <Mail className="h-4 w-4 shrink-0 text-white/70" />
              <a
                href={mounted ? `mailto:${SUPPORT_EMAIL}` : undefined}
                className="min-w-0 transition-colors [overflow-wrap:anywhere] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                suppressHydrationWarning
              >
                {mounted ? SUPPORT_EMAIL : t("contactSupport")}
              </a>
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span id={`footer-social-${locale}-${variant}`} className="sr-only">
              {t("followUs")}
            </span>
            <nav aria-labelledby={`footer-social-${locale}-${variant}`} className="flex items-center gap-2">
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="WhatsApp"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[rgba(37,211,102,0.38)] bg-white/[0.04] text-[#25D366] transition-all duration-200 hover:-translate-y-0.5 hover:border-[rgba(37,211,102,0.6)] hover:bg-[rgba(37,211,102,0.12)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <WhatsAppIcon className="h-[18px] w-[18px]" />
              </a>
              <a
                href={INSTAGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[rgba(247,119,55,0.34)] bg-white/[0.04] text-white transition-all duration-200 hover:-translate-y-0.5 hover:border-[rgba(247,119,55,0.6)] hover:bg-[linear-gradient(135deg,rgba(64,93,230,0.12),rgba(225,48,108,0.16),rgba(252,176,69,0.18))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <InstagramIcon className="h-[18px] w-[18px]" />
              </a>
            </nav>
            <p className="ms-auto lg:ms-0">
              &copy; {year} MPLOYEDIN. {t("allRights")}
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
