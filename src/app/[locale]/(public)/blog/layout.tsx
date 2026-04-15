import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === "ar";
  return {
    title: isAr ? "مدونة MPLOYEDIN — رؤى سوق العمل الخليجي" : "Blog – Gulf Recruitment Insights | MPLOYEDIN",
    description: isAr
      ? "آخر الرؤى والاتجاهات في سوق العمل الخليجي، ونصائح التوظيف، وأخبار الموارد البشرية"
      : "Latest Gulf job market trends, recruitment tips, AI hiring insights, and HR news from the MPLOYEDIN team.",
  };
}

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
