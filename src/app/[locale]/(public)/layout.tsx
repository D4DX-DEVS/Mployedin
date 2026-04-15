import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import PublicHeader from "@/components/shared/PublicHeader";
import PublicFooter from "@/components/shared/PublicFooter";
import CookieConsent from "@/components/shared/CookieConsent";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://mployedin.vercel.app";

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "MPLOYEDIN",
  url: BASE_URL,
  logo: `${BASE_URL}/logo.png`,
  description:
    "AI-Powered International Recruitment Platform for the Gulf region",
  areaServed: ["SA", "AE", "KW", "QA", "BH", "OM"],
};

const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  url: BASE_URL,
  name: "MPLOYEDIN",
  potentialAction: {
    "@type": "SearchAction",
    target: `${BASE_URL}/en/jobs?q={search_term_string}`,
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
    "AI-powered recruitment platform connecting Gulf employers with international candidates",
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
      <div className="flex min-h-screen flex-col">
        <PublicHeader locale={locale} />
        <main className="flex-1">{children}</main>
        <PublicFooter locale={locale} />
        <CookieConsent locale={locale} />
      </div>
    </NextIntlClientProvider>
  );
}
