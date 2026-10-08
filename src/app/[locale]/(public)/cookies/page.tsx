import { Cookie } from "lucide-react";
import { LegalPage } from "@/components/features/public/LegalPage";
import { CookieInventoryTable } from "@/components/features/public/CookieInventoryTable";
import { CookieChoiceSummary } from "@/components/shared/consent/CookieChoiceSummary";

export default async function CookiePolicyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <LegalPage
      locale={locale}
      slug="cookie-policy"
      icon={Cookie}
      keys={{
        heading: "cookiesHeading",
        lastUpdated: "cookiesLastUpdated",
        intro: "cookiesIntro",
        preparing: "cookiesPreparing",
        agreement: "cookiesAgreement",
      }}
    >
      <CookieChoiceSummary />
      <CookieInventoryTable />
    </LegalPage>
  );
}
