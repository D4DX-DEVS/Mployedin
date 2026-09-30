"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Accessibility, Building2, Calendar, Cookie, FileText, Mail, MapPin, Shield, ShieldCheck, type LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { sanitizeHtml } from "@/lib/security/html";
import { formatDate } from "@/lib/ui/intlFormat";
import type { LegalPageSlug } from "@/lib/cms/legalPages";

type LegalKind = "privacy" | "terms" | "cookies" | "gdpr" | "accessibility";
type LandingT = ReturnType<typeof useTranslations<"landing">>;

interface LegalCopy {
  heading: string;
  subheading?: string;
  intro: string;
  preparing: string;
  agreement: string;
}

// Literal t() keys per page, so the message-key checks can see every one.
const KINDS: Record<LegalKind, { slug: LegalPageSlug; icon: LucideIcon; copy: (t: LandingT) => LegalCopy }> = {
  privacy: {
    slug: "privacy-policy",
    icon: Shield,
    copy: (t) => ({ heading: t("privacyHeading"), intro: t("privacyIntro"), preparing: t("privacyPreparing"), agreement: t("privacyAgreement") }),
  },
  terms: {
    slug: "terms-and-conditions",
    icon: FileText,
    copy: (t) => ({ heading: t("termsHeading"), intro: t("termsIntro"), preparing: t("termsPreparing"), agreement: t("termsAgreement") }),
  },
  cookies: {
    slug: "cookie-policy",
    icon: Cookie,
    copy: (t) => ({ heading: t("cookiesHeading"), intro: t("cookiesIntro"), preparing: t("cookiesPreparing"), agreement: t("cookiesAgreement") }),
  },
  gdpr: {
    slug: "gdpr",
    icon: ShieldCheck,
    copy: (t) => ({
      heading: t("gdprHeading"),
      subheading: t("gdprSubheading"),
      intro: t("gdprIntro"),
      preparing: t("gdprPreparing"),
      agreement: t("gdprAgreement"),
    }),
  },
  accessibility: {
    slug: "accessibility-statement",
    icon: Accessibility,
    copy: (t) => ({
      heading: t("accessibilityHeading"),
      intro: t("accessibilityIntro"),
      preparing: t("accessibilityPreparing"),
      agreement: t("accessibilityAgreement"),
    }),
  },
};

// Styles the admin's HTML. `prose` did nothing here: @tailwindcss/typography
// is not installed, so headings looked like body text and links like plain
// text. Logical padding (ps-*) keeps list bullets on the right side in Arabic.
const CONTENT_CLASSES = [
  "px-6 py-8 leading-7 sm:px-8 [&>:first-child]:mt-0 [&>:last-child]:mb-0",
  "[&_h2]:mb-4 [&_h2]:mt-8 [&_h2]:scroll-mt-20 [&_h2]:border-b [&_h2]:border-border/40 [&_h2]:pb-3 [&_h2]:text-xl [&_h2]:font-semibold",
  "[&_h3]:mb-3 [&_h3]:mt-6 [&_h3]:scroll-mt-20 [&_h3]:text-lg [&_h3]:font-semibold",
  "[&_p]:my-4 [&_ul]:my-4 [&_ul]:list-disc [&_ul]:ps-6 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:ps-6 [&_li]:my-1",
  "[&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_strong]:font-semibold",
].join(" ");

interface PublishedPage {
  title?: string;
  titleAr?: string;
  body?: string;
  bodyAr?: string;
  updatedAt?: string;
}

/**
 * One of the legal pages, edited under Admin → CMS → Static Pages. The
 * title and "last updated" date come from the saved page — the old copies
 * printed an i18n heading and a hardcoded "8th June 2023" whatever the admin
 * saved. Before a page is published it keeps the default heading and says the
 * content is being prepared.
 */
export default function LegalPage({ kind }: { kind: LegalKind }) {
  const pathname = usePathname();
  const locale = pathname.split("/")[1] || "en";
  const isAr = locale === "ar";
  const t = useTranslations("landing");
  const { slug, icon: Icon, copy } = KINDS[kind];
  const text = copy(t);

  const [page, setPage] = useState<PublishedPage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/public/pages/${slug}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setPage(d?.page ?? null); })
      .catch(() => { if (!cancelled) setPage(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [slug]);

  const title = page ? (isAr ? page.titleAr || page.title : page.title) || text.heading : text.heading;
  const body = page ? (isAr ? page.bodyAr || page.body : page.body) ?? "" : "";

  if (loading) {
    return (
      <div className="bg-muted/30 min-h-[80vh] py-14" aria-busy="true">
        <div className="container mx-auto flex max-w-4xl flex-col items-center gap-4 px-4">
          <Skeleton className="h-16 w-16 rounded-2xl" />
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-6 h-96 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-muted/30 min-h-[80vh] py-14">
      <div className="container mx-auto px-4 max-w-4xl">
        {/* Hero header */}
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm">
            <Icon className="h-8 w-8" aria-hidden="true" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight">{title}</h1>
          {text.subheading && (
            <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">{text.subheading}</p>
          )}
          {page?.updatedAt && (
            <div className="mt-3 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>
                {t("legalLastUpdated", {
                  date: formatDate(page.updatedAt, { day: "numeric", month: "long", year: "numeric" }, locale),
                })}
              </span>
            </div>
          )}
        </div>

        {body ? (
          <div className="rounded-2xl border border-border/60 bg-background shadow-sm">
            {/* Intro banner */}
            <div className="border-b border-border/60 bg-muted/40 px-6 py-5 rounded-t-2xl sm:px-8">
              <p className="text-sm leading-relaxed text-muted-foreground">{text.intro}</p>
            </div>

            {/* Body content */}
            <div
              className={CONTENT_CLASSES}
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(body) }}
            />

            {/* Contact footer card */}
            <div className="border-t border-border/60 bg-muted/40 px-6 py-6 rounded-b-2xl sm:px-8">
              <h2 className="heading-label font-semibold uppercase tracking-wider text-muted-foreground mb-4">
                {t("contactUs")}
              </h2>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="flex items-start gap-3 rounded-xl border border-border/50 bg-background card-pad">
                  <Building2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="text-sm text-foreground leading-5">MPLOYEDIN UK LTD</span>
                </div>
                <div className="flex items-start gap-3 rounded-xl border border-border/50 bg-background card-pad">
                  <MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="text-sm text-foreground leading-5">X2 Greenleaf Walk, Southall, UB1 1FR</span>
                </div>
                <div className="flex items-start gap-3 rounded-xl border border-border/50 bg-background card-pad">
                  <Mail aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <a href="mailto:support@mployedin.com" className="text-sm text-primary hover:underline">
                    support@mployedin.com
                  </a>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center text-muted-foreground py-10">
            <p>{text.preparing}</p>
          </div>
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground">{text.agreement}</p>
      </div>
    </div>
  );
}
