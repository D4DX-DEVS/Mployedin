"use client";

import { UnifiedMessagesPage } from "@/components/features/dm/UnifiedMessagesPage";

export default function EmployerMessagesPage() {
  return (
    <UnifiedMessagesPage
      dashboardPrefix="employer"
      title="Messages"
      description="Direct messages with agents & super agents"
      showNewChat={true}
      showCustomerCare={false}
    />
  );
}
