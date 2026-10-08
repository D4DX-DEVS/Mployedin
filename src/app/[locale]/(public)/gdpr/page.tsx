import { ShieldCheck } from "lucide-react";
import { LegalPage } from "@/components/features/public/LegalPage";

export default async function GdprPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <LegalPage
      locale={locale}
      slug="gdpr"
      icon={ShieldCheck}
      keys={{
        heading: "gdprHeading",
        subheading: "gdprSubheading",
        lastUpdated: "gdprLastUpdated",
        intro: "gdprIntro",
        preparing: "gdprPreparing",
        agreement: "gdprAgreement",
      }}
    />
  );
}
