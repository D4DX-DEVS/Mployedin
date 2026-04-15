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
      ? "إجابات على أكثر الأسئلة شيوعاً حول منصة MPLOYEDIN للتوظيف الذكي في الخليج"
      : "Answers to common questions about MPLOYEDIN — the AI-powered recruitment platform for the Gulf region.",
  };
}

export default function FAQLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
