import type { Metadata } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://mployedin-8a4rc.ondigitalocean.app";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === "ar";
  const canonicalUrl = `${BASE_URL}/${locale}/terms`;

  return {
    title: isAr ? "شروط الاستخدام | MPLOYEDIN" : "Terms of Service | MPLOYEDIN",
    description: isAr
      ? "اقرأ شروط استخدام منصة MPLOYEDIN."
      : "Read the Terms of Service for the MPLOYEDIN recruitment platform.",
    alternates: {
      canonical: canonicalUrl,
      languages: {
        en: `${BASE_URL}/en/terms`,
        ar: `${BASE_URL}/ar/terms`,
        "x-default": `${BASE_URL}/en/terms`,
      },
    },
    robots: { index: true, follow: true },
  };
}

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
