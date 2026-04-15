import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";

const locales = ["en", "ar"];

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://mployedin.vercel.app";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const url = `${BASE_URL}/${locale}`;

  return {
    title: {
      template: "%s | MPLOYEDIN",
      default: "MPLOYEDIN — AI-Powered Recruitment",
    },
    description: "AI-Powered International Recruitment Platform connecting employers and top talent worldwide.",
    metadataBase: new URL(BASE_URL),
    alternates: {
      canonical: url,
      languages: {
        en: `${BASE_URL}/en`,
        ar: `${BASE_URL}/ar`,
        "x-default": `${BASE_URL}/en`,
      },
    },
    openGraph: {
      siteName: "MPLOYEDIN",
      locale: locale === "ar" ? "ar_SA" : "en_US",
      type: "website",
      images: [
        {
          url: "/og-image.jpg",
          width: 1200,
          height: 630,
          alt: "MPLOYEDIN — AI-Powered International Recruitment Platform",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      images: ["/og-image.jpg"],
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!locales.includes(locale)) {
    notFound();
  }

  const messages = await getMessages();
  const dir = locale === "ar" ? "rtl" : "ltr";

  return (
    <div lang={locale} dir={dir} className={locale === "ar" ? "font-arabic" : ""}>
      <NextIntlClientProvider locale={locale} messages={messages}>
        {children}
      </NextIntlClientProvider>
    </div>
  );
}
