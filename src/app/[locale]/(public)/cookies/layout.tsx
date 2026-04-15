import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === "ar";
  return {
    title: isAr ? "سياسة ملفات تعريف الارتباط | MPLOYEDIN" : "Cookie Policy | MPLOYEDIN",
    description: isAr
      ? "سياسة ملفات تعريف الارتباط لمنصة MPLOYEDIN — ما هي ملفات تعريف الارتباط التي نستخدمها ولماذا"
      : "MPLOYEDIN cookie policy — what cookies we use and why.",
    robots: { index: false, follow: true },
  };
}

export default function CookiesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
