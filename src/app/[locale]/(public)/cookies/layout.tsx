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
    title: `${t("cookiesHeading")} | MPLOYEDIN`,
    description: t("cookiesPreparing"),
    robots: { index: false, follow: true },
  };
}

export default function CookiesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
