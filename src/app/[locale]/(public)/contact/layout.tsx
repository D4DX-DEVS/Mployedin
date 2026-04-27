import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  await params;
  const t = await getTranslations("landing");
  return {
    title: `${t("contactHeading")} | MPLOYEDIN`,
    description: t("contactSubtitle"),
  };
}

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
