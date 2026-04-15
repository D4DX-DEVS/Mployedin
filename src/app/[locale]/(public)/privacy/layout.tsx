import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === "ar";
  return {
    title: isAr ? "سياسة الخصوصية | MPLOYEDIN" : "Privacy Policy | MPLOYEDIN",
    description: isAr
      ? "سياسة الخصوصية لمنصة MPLOYEDIN — كيف نجمع بياناتك ونستخدمها ونحميها"
      : "MPLOYEDIN privacy policy — how we collect, use, and protect your personal data.",
    robots: { index: false, follow: true },
  };
}

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
