import { redirect } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { pickMessages } from "@/lib/i18n/clientMessages";
import { auth } from "@/lib/auth/config";
import { SessionWrapper } from "@/components/shared/SessionWrapper";
import { CsrfProvider } from "@/components/shared/CsrfProvider";
import { CookieConsentMount } from "@/components/shared/CookieConsentMount";
import PublicFooter from "@/components/shared/PublicFooter";
import { AccessibilityPanel } from "@/components/shared/AccessibilityPanel";
import { isLegalPagePublished } from "@/lib/cms/legalPageStatus";
import { MAIN_CONTENT_ID } from "@/components/shared/SkipToContent";

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
  const statementPublished = await isLegalPagePublished("accessibility-statement");

  return (
    <NextIntlClientProvider locale={locale} messages={pickMessages(messages, "onboarding")}>
    <SessionWrapper>
      <CsrfProvider>
        <div
          className="theme-light flex min-h-screen flex-col bg-background text-foreground"
          data-theme-scope="light"
        >
          <AccessibilityPanel locale={locale} statementPublished={statementPublished} />
          <main id={MAIN_CONTENT_ID} className="flex-1">{children}</main>
          <PublicFooter locale={locale} variant="embedded" showAccessibilityLink={statementPublished} />
        </div>
        <CookieConsentMount locale={locale} />
      </CsrfProvider>
    </SessionWrapper>
    </NextIntlClientProvider>
  );
}
