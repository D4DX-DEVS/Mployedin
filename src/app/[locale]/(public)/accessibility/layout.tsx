import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { isLegalPagePublished } from "@/lib/cms/legalPageStatus";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://mployedin-8a4rc.ondigitalocean.app";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations("landing");

  return {
    title: t("accessibilityHeading"),
    description: t("accessibilityIntro"),
    alternates: {
      canonical: `${BASE_URL}/${locale}/accessibility`,
      languages: {
        en: `${BASE_URL}/en/accessibility`,
        ar: `${BASE_URL}/ar/accessibility`,
        "x-default": `${BASE_URL}/en/accessibility`,
      },
    },
    robots: { index: true, follow: true },
  };
}

// Nothing links here until an admin sets the statement Active, so the URL is a
// 404 until then. Checked here, not in the page: loading.tsx wraps the page in
// a Suspense boundary, and a notFound() streamed from inside it goes out as 200.
export default async function AccessibilityLayout({ children }: { children: React.ReactNode }) {
  if (!(await isLegalPagePublished("accessibility-statement"))) notFound();
  return <>{children}</>;
}
