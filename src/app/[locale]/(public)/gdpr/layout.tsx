import type { Metadata } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://mployedin-8a4rc.ondigitalocean.app";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === "ar";
  const canonicalUrl = `${BASE_URL}/${locale}/gdpr`;

  return {
    title: isAr ? "سياسة حماية البيانات (GDPR) | MPLOYEDIN" : "GDPR & Data Protection | MPLOYEDIN",
    description: isAr
      ? "سياسة حماية البيانات الشخصية وفقاً للائحة GDPR على منصة MPLOYEDIN."
      : "GDPR compliance and data protection policy for MPLOYEDIN users.",
    alternates: {
      canonical: canonicalUrl,
      languages: {
        en: `${BASE_URL}/en/gdpr`,
        ar: `${BASE_URL}/ar/gdpr`,
        "x-default": `${BASE_URL}/en/gdpr`,
      },
    },
    robots: { index: true, follow: true },
  };
}

export default function GDPRLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
