import type { Metadata } from "next";
import LandingPage from "@/components/features/public/LandingPage";

// Landing page is mostly static — revalidate once per hour
export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === "ar";
  return {
    title: isAr
      ? "MPLOYEDIN — منصة التوظيف الذكية للخليج"
      : "Gulf Recruitment Platform – Hire Top International Talent | MPLOYEDIN",
    description: isAr
      ? "منصة توظيف دولية مدعومة بالذكاء الاصطناعي لمنطقة الخليج — ابحث عن المواهب واتخذ قرارات توظيف مبنية على البيانات"
      : "AI-powered international recruitment platform for the Gulf region. Discover top candidates, streamline hiring, and make data-driven decisions.",
  };
}

export default function PublicHomePage() {
  return <LandingPage />;
}
