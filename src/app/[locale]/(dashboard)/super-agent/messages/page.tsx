"use client";

import { useTranslations } from "next-intl";
import { UnifiedMessagesPage } from "@/components/features/dm/UnifiedMessagesPage";

export default function SuperAgentMessagesPage() {
  const t = useTranslations("superAgentMessages");
  return (
    <UnifiedMessagesPage
      dashboardPrefix="super-agent"
      title={t("title")}
      description={t("description")}
      showNewChat={true}
      showCustomerCare={false}
    />
  );
}
