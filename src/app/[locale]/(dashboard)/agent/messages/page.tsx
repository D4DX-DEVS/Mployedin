"use client";

import { useTranslations } from "next-intl";
import { UnifiedMessagesPage } from "@/components/features/dm/UnifiedMessagesPage";
import { AgentSectionTabs, AGENT_INBOX_TABS } from "@/components/features/agent/AgentSectionTabs";

export default function AgentMessagesPage() {
  const t = useTranslations("agentMessages");
  // Direct messages and the team channels used to be two top-level sidebar
  // rows, so an agent had to remember to check the second one. One nav entry
  // now, two tabs — under the page title, so the title reads first.
  return (
    <UnifiedMessagesPage
      dashboardPrefix="agent"
      title={t("title")}
      description={t("description")}
      showNewChat={true}
      showCustomerCare={false}
      subNav={<AgentSectionTabs tabs={AGENT_INBOX_TABS} ariaLabelKey="inboxTabsLabel" />}
    />
  );
}
