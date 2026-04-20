"use client";

import { UnifiedMessagesPage } from "@/components/features/dm/UnifiedMessagesPage";

export default function AgentMessagesPage() {
  return (
    <UnifiedMessagesPage
      dashboardPrefix="agent"
      title="Messages"
      description="Direct messages with employers & super agents"
      showNewChat={true}
      showCustomerCare={false}
    />
  );
}
