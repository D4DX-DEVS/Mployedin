import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { pickMessages } from "@/lib/i18n/clientMessages";
import PublicHeader from "@/components/shared/PublicHeader";
import PublicFooter from "@/components/shared/PublicFooter";
import { AccessibilityPanel } from "@/components/shared/AccessibilityPanel";
import { MAIN_CONTENT_ID } from "@/components/shared/SkipToContent";
import { isLegalPagePublished } from "@/lib/cms/legalPageStatus";
import { CookieConsentMount } from "@/components/shared/CookieConsentMount";
import { SessionWrapper } from "@/components/shared/SessionWrapper";
import { DashboardProviders } from "@/components/shared/DashboardProviders";
import { CsrfProvider } from "@/components/shared/CsrfProvider";
import { serializeJsonLd } from "@/lib/security/jsonLd";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://mployedin-8a4rc.ondigitalocean.app";

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "MPLOYEDIN",
  url: BASE_URL,
  logo: `${BASE_URL}/mployedin-logo.png`,
  description:
    "AI-Powered International Recruitment Platform connecting employers and top talent worldwide.",
  areaServed: "Worldwide",
  sameAs: [
    "https://www.linkedin.com/company/mployedin",
  ],
};

const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  url: BASE_URL,
  name: "MPLOYEDIN",
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: `${BASE_URL}/en/jobs?search={search_term_string}`,
    },
    "query-input": "required name=search_term_string",
  },
};

const softwareSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "MPLOYEDIN",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "AI-powered recruitment platform connecting employers with top talent worldwide.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

export default async function PublicLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const messages = await getMessages();
  const statementPublished = await isLegalPagePublished("accessibility-statement");

  return (
    <NextIntlClientProvider locale={locale} messages={pickMessages(messages, "public")}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(organizationSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(websiteSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(softwareSchema) }}
      />
      <SessionWrapper disableIdleTimeout>
        {/* Easy Apply and other public-page mutations need the CSRF fetch patch
            installed — without it POSTs from shared/public pages 403. */}
        <CsrfProvider>
        <DashboardProviders>
          <div className="flex min-h-screen flex-col [&_a]:cursor-pointer [&_button]:cursor-pointer">
            {/* First after the skip link in the tab order; the panel is fixed, so it takes no space. */}
            <AccessibilityPanel locale={locale} statementPublished={statementPublished} />
            <PublicHeader locale={locale} />
            {/* scroll-mt: the skip link must not land the page under the sticky header. */}
            <main id={MAIN_CONTENT_ID} className="flex-1 scroll-mt-16">{children}</main>
            <PublicFooter locale={locale} showAccessibilityLink={statementPublished} />
            <CookieConsentMount locale={locale} />
          </div>
        </DashboardProviders>
        </CsrfProvider>
      </SessionWrapper>
    </NextIntlClientProvider>
  );
}
