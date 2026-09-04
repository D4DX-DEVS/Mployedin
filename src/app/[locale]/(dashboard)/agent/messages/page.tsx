"use client";

import { useTranslations } from "next-intl";
import { UnifiedMessagesPage } from "@/components/features/dm/UnifiedMessagesPage";
import { AgentSectionTabs, AGENT_INBOX_TABS } from "@/components/features/agent/AgentSectionTabs";

export default function AgentMessagesPage() {
  const t = useTranslations("agentMessages");
  // Direct messages and the team channels used to be two top-level sidebar
  // rows, so an agent had to remember to check the second one. One nav entry
  // now, two tabs.
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="px-4 pt-4 sm:px-6">
        <AgentSectionTabs tabs={AGENT_INBOX_TABS} ariaLabelKey="inboxTabsLabel" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <UnifiedMessagesPage
          dashboardPrefix="agent"
          title={t("title")}
          description={t("description")}
          showNewChat={true}
          showCustomerCare={false}
        />
      </div>
    </div>
  );
}
