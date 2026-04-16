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

  return (
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
  );
}
