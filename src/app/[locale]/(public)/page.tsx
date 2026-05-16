import type { Metadata } from "next";
import LandingPage from "@/components/features/public/LandingPage";

// Landing page is mostly static — revalidate once per hour
export const revalidate = 3600;

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://mployedin-8a4rc.ondigitalocean.app";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === "ar";
  const canonicalUrl = `${BASE_URL}/${locale}`;

  return {
    title: isAr
      ? "MPLOYEDIN — منصة التوظيف الذكية العالمية"
      : "AI-Powered International Recruitment Platform – Hire Top Talent Worldwide | MPLOYEDIN",
    description: isAr
      ? "منصة توظيف دولية مدعومة بالذكاء الاصطناعي — ابحث عن أفضل المواهب حول العالم واتخذ قرارات توظيف مبنية على البيانات"
      : "AI-powered international recruitment platform connecting employers with top talent worldwide. Discover candidates, streamline hiring, and make data-driven decisions.",
    alternates: {
      canonical: canonicalUrl,
      languages: {
        en: `${BASE_URL}/en`,
        ar: `${BASE_URL}/ar`,
        "x-default": `${BASE_URL}/en`,
      },
    },
    openGraph: {
      url: canonicalUrl,
      type: "website",
    },
  };
}

export default function PublicHomePage() {
  return <LandingPage />;
}
