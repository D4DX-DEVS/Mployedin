import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === "ar";
  return {
    title: isAr ? "الأسئلة الشائعة | MPLOYEDIN" : "FAQ – Frequently Asked Questions | MPLOYEDIN",
    description: isAr
      ? "إجابات على أكثر الأسئلة شيوعاً حول منصة MPLOYEDIN للتوظيف الذكي العالمي"
      : "Answers to common questions about MPLOYEDIN — the AI-powered international recruitment platform.",
  };
}

export default function FAQLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
