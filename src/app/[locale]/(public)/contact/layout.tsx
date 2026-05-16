import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://mployedin-8a4rc.ondigitalocean.app";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations("landing");
  const canonicalUrl = `${BASE_URL}/${locale}/contact`;

  return {
    title: `${t("contactHeading")} | MPLOYEDIN`,
    description: t("contactSubtitle"),
    alternates: {
      canonical: canonicalUrl,
      languages: {
        en: `${BASE_URL}/en/contact`,
        ar: `${BASE_URL}/ar/contact`,
        "x-default": `${BASE_URL}/en/contact`,
      },
    },
    openGraph: {
      title: `${t("contactHeading")} | MPLOYEDIN`,
      description: t("contactSubtitle"),
      type: "website",
      url: canonicalUrl,
    },
  };
}

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
