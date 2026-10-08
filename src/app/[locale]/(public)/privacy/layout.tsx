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
  const canonicalUrl = `${BASE_URL}/${locale}/privacy`;
  // JS-3: the description used to be the "content is being prepared" placeholder.
  const description = t("privacyIntro").slice(0, 160);
  return {
    title: t("privacyHeading"),
    description,
    alternates: {
      canonical: canonicalUrl,
      languages: {
        en: `${BASE_URL}/en/privacy`,
        ar: `${BASE_URL}/ar/privacy`,
        "x-default": `${BASE_URL}/en/privacy`,
      },
    },
    openGraph: { title: t("privacyHeading"), description, type: "website", url: canonicalUrl },
    robots: { index: true, follow: true },
  };
}

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
