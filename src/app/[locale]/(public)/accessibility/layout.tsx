import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://mployedin-8a4rc.ondigitalocean.app";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "accessibilityStatement" });
  const canonicalUrl = `${BASE_URL}/${locale}/accessibility`;
  const description = t("metaDescription");
  return {
    title: t("metaTitle"),
    description,
    alternates: {
      canonical: canonicalUrl,
      languages: {
        en: `${BASE_URL}/en/accessibility`,
        ar: `${BASE_URL}/ar/accessibility`,
        "x-default": `${BASE_URL}/en/accessibility`,
      },
    },
    openGraph: { title: t("metaTitle"), description, type: "website", url: canonicalUrl },
    robots: { index: true, follow: true },
  };
}

export default function AccessibilityLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
