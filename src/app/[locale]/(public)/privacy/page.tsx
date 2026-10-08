import { Shield } from "lucide-react";
import { LegalPage } from "@/components/features/public/LegalPage";
import { PrivacyChoices } from "@/components/features/public/PrivacyChoices";

export default async function PrivacyPolicyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <LegalPage
      locale={locale}
      slug="privacy-policy"
      icon={Shield}
      keys={{
        heading: "privacyHeading",
        lastUpdated: "privacyLastUpdated",
        intro: "privacyIntro",
        preparing: "privacyPreparing",
        agreement: "privacyAgreement",
      }}
    >
      <PrivacyChoices locale={locale} />
    </LegalPage>
  );
}
