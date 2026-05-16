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
  const canonicalUrl = `${BASE_URL}/${locale}/faq`;

  return {
    title: `${t("faqHeading")} | MPLOYEDIN`,
    description: t("faqSubtitle2"),
    alternates: {
      canonical: canonicalUrl,
      languages: {
        en: `${BASE_URL}/en/faq`,
        ar: `${BASE_URL}/ar/faq`,
        "x-default": `${BASE_URL}/en/faq`,
      },
    },
    openGraph: {
      title: `${t("faqHeading")} | MPLOYEDIN`,
      description: t("faqSubtitle2"),
      type: "website",
      url: canonicalUrl,
    },
  };
}

export default function FAQLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
