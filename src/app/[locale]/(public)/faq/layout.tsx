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
    title: `${t("faqHeading")} | MPLOYEDIN`,
    description: t("faqSubtitle2"),
  };
}

export default function FAQLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
