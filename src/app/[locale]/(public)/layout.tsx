import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import PublicHeader from "@/components/shared/PublicHeader";
import PublicFooter from "@/components/shared/PublicFooter";
import CookieConsent from "@/components/shared/CookieConsent";

export default async function PublicLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const messages = await getMessages();

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <div className="flex min-h-screen flex-col">
        <PublicHeader locale={locale} />
        <main className="flex-1">{children}</main>
        <PublicFooter locale={locale} />
        <CookieConsent locale={locale} />
      </div>
    </NextIntlClientProvider>
  );
}
