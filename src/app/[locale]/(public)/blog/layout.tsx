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
  const canonicalUrl = `${BASE_URL}/${locale}/blog`;

  return {
    title: t("blogHeading"),
    description: t("blogSubtitle"),
    alternates: {
      canonical: canonicalUrl,
      languages: {
        en: `${BASE_URL}/en/blog`,
        ar: `${BASE_URL}/ar/blog`,
        "x-default": `${BASE_URL}/en/blog`,
      },
    },
    openGraph: {
      title: `${t("blogHeading")} | MPLOYEDIN`,
      description: t("blogSubtitle"),
      type: "website",
      url: canonicalUrl,
    },
  };
}

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
