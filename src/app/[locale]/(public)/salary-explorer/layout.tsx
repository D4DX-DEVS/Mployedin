import type { Metadata } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://mployedin-8a4rc.ondigitalocean.app";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === "ar";
  const canonicalUrl = `${BASE_URL}/${locale}/salary-explorer`;

  return {
    title: isAr
      ? "مستكشف الرواتب"
      : "Salary Explorer – International Salary Benchmarks",
    description: isAr
      ? "استكشف متوسطات الرواتب حسب المسمى الوظيفي والدولة حول العالم."
      : "Explore salary benchmarks by job title and country worldwide. Make informed career decisions.",
    alternates: {
      canonical: canonicalUrl,
      languages: {
        en: `${BASE_URL}/en/salary-explorer`,
        ar: `${BASE_URL}/ar/salary-explorer`,
        "x-default": `${BASE_URL}/en/salary-explorer`,
      },
    },
    openGraph: {
      title: isAr ? "مستكشف الرواتب | MPLOYEDIN" : "Salary Explorer | MPLOYEDIN",
      description: isAr
        ? "استكشف متوسطات الرواتب حول العالم."
        : "Explore salary benchmarks worldwide.",
      type: "website",
      url: canonicalUrl,
    },
  };
}

export default function SalaryExplorerLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
