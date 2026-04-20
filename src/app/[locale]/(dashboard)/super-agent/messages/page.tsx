"use client";

import { UnifiedMessagesPage } from "@/components/features/dm/UnifiedMessagesPage";

export default function SuperAgentMessagesPage() {
  return (
    <UnifiedMessagesPage
      dashboardPrefix="super-agent"
      title="Messages"
      description="Direct messages with agents, employers & team"
      showNewChat={true}
      showCustomerCare={false}
    />
  );
}
