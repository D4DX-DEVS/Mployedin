import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === "ar";
  return {
    title: isAr ? "تواصل معنا | MPLOYEDIN" : "Contact Us | MPLOYEDIN",
    description: isAr
      ? "تواصل مع فريق MPLOYEDIN — نحن هنا للمساعدة في احتياجات التوظيف الخاصة بك في الخليج"
      : "Get in touch with the MPLOYEDIN team. We're here to help with your Gulf region recruitment needs.",
  };
}

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
