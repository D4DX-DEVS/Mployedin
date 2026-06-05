"use client";

import { useTranslations } from "next-intl";
import { UnifiedMessagesPage } from "@/components/features/dm/UnifiedMessagesPage";

export default function JobSeekerMessagesPage() {
  const t = useTranslations("jobSeekerMessages");

  return (
    <UnifiedMessagesPage
      dashboardPrefix="job-seeker"
      title={t("title")}
      description={t("description")}
      showNewChat={false}
      showCustomerCare={true}
      supportOnly={true}
    />
  );
}
