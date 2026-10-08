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
  const canonicalUrl = `${BASE_URL}/${locale}/cookies`;
  // JS-3: the description used to be the "content is being prepared" placeholder.
  const description = t("cookiesIntro").slice(0, 160);
  return {
    title: t("cookiesHeading"),
    description,
    alternates: {
      canonical: canonicalUrl,
      languages: {
        en: `${BASE_URL}/en/cookies`,
        ar: `${BASE_URL}/ar/cookies`,
        "x-default": `${BASE_URL}/en/cookies`,
      },
    },
    openGraph: { title: t("cookiesHeading"), description, type: "website", url: canonicalUrl },
    robots: { index: true, follow: true },
  };
}

export default function CookiesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
