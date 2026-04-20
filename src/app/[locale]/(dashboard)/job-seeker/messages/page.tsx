"use client";

import { UnifiedMessagesPage } from "@/components/features/dm/UnifiedMessagesPage";

export default function JobSeekerMessagesPage() {
  return (
    <UnifiedMessagesPage
      dashboardPrefix="job-seeker"
      title="Messages"
      description="Chat with employers & contact support"
      showNewChat={true}
      showCustomerCare={true}
    />
  );
}
