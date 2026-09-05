"use client";

import { useTranslations } from "next-intl";
import { UnifiedMessagesPage } from "@/components/features/dm/UnifiedMessagesPage";

export default function EmployerMessagesPage() {
  const t = useTranslations("employerMessages");
  return (
    <UnifiedMessagesPage
      dashboardPrefix="employer"
      headerVariant="workspace"
      title={t("title")}
      description={t("description")}
      showNewChat={true}
      showCustomerCare={false}
      newChatLabel={t("newChat")}
      searchPlaceholder={t("searchConversations")}
      emptyStateText={t("emptyState")}
      selectConversationTitle={t("selectConversation")}
      selectConversationHint={t("selectConversationHint")}
    />
  );
}
