"use client";

import { UnifiedMessagesPage } from "@/components/features/dm/UnifiedMessagesPage";

export default function AdminMessagesPage() {
  return (
    <UnifiedMessagesPage
      dashboardPrefix="admin"
      title="Messages"
      description="Direct messages with employers, agents & support tickets"
      showNewChat={true}
      showCustomerCare={true}
    />
  );
}
