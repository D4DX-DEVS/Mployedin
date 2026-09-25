import { redirect } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { pickMessages } from "@/lib/i18n/clientMessages";
import { auth } from "@/lib/auth/config";
import { SessionWrapper } from "@/components/shared/SessionWrapper";
import { CsrfProvider } from "@/components/shared/CsrfProvider";
import PublicFooter from "@/components/shared/PublicFooter";

export default async function OnboardingLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // Defense in depth behind the middleware (onboarding is not a public route):
  // never render the onboarding flow for anonymous visitors.
  const session = await auth();
  if (!session?.user) {
    redirect(`/${locale}/login`);
  }

  const messages = await getMessages();

  return (
    <NextIntlClientProvider locale={locale} messages={pickMessages(messages, "onboarding")}>
    <SessionWrapper>
      <CsrfProvider>
        <div
          className="theme-light flex min-h-screen flex-col bg-background text-foreground"
          data-theme-scope="light"
        >
          <div className="flex-1">{children}</div>
          <PublicFooter locale={locale} variant="embedded" />
        </div>
      </CsrfProvider>
    </SessionWrapper>
    </NextIntlClientProvider>
  );
}
