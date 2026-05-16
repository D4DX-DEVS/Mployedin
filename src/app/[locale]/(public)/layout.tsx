import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import PublicHeader from "@/components/shared/PublicHeader";
import PublicFooter from "@/components/shared/PublicFooter";
import CookieConsent from "@/components/shared/CookieConsent";
import { SessionWrapper } from "@/components/shared/SessionWrapper";
import { DashboardProviders } from "@/components/shared/DashboardProviders";

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

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }}
      />
      <SessionWrapper disableIdleTimeout>
        <DashboardProviders>
          <div className="flex min-h-screen flex-col">
            <PublicHeader locale={locale} />
            <main className="flex-1">{children}</main>
            <PublicFooter locale={locale} />
            <CookieConsent locale={locale} />
          </div>
        </DashboardProviders>
      </SessionWrapper>
    </NextIntlClientProvider>
  );
}
