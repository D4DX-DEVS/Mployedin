"use client";

import { UnifiedMessagesPage } from "@/components/features/dm/UnifiedMessagesPage";

export default function JobSeekerMessagesPage() {
  return (
    <UnifiedMessagesPage
      dashboardPrefix="job-seeker"
      title="Support"
      description="Contact support for help"
      showNewChat={false}
      showCustomerCare={true}
      supportOnly={true}
    />
  );
}
