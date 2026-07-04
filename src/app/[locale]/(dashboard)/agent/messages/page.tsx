"use client";

import { useTranslations } from "next-intl";
import { UnifiedMessagesPage } from "@/components/features/dm/UnifiedMessagesPage";

export default function AgentMessagesPage() {
  const t = useTranslations("agentMessages");
  return (
    <UnifiedMessagesPage
      dashboardPrefix="agent"
      title={t("title")}
      description={t("description")}
      showNewChat={true}
      showCustomerCare={false}
    />
  );
}
