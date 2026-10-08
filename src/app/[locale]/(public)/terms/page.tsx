import { FileText } from "lucide-react";
import { LegalPage } from "@/components/features/public/LegalPage";

export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <LegalPage
      locale={locale}
      slug="terms-and-conditions"
      icon={FileText}
      keys={{
        heading: "termsHeading",
        lastUpdated: "lastUpdated",
        intro: "termsIntro",
        preparing: "termsPreparing",
        agreement: "termsAgreement",
      }}
    />
  );
}
