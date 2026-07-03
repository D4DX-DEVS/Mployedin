"use client";

import { useTranslations } from "next-intl";
import { UnifiedMessagesPage } from "@/components/features/dm/UnifiedMessagesPage";

export default function AdminMessagesPage() {
  const t = useTranslations("adminMessages");

  return (
    <UnifiedMessagesPage
      dashboardPrefix="admin"
      title={t("pageTitle")}
      description={t("pageDescription")}
      showNewChat={true}
      showCustomerCare={true}
    />
  );
}
