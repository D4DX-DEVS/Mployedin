"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UnifiedMessagesPage } from "@/components/features/dm/UnifiedMessagesPage";
import { MessageAgentsDialog } from "@/components/features/super-agent/MessageAgentsDialog";
import { conversationKeys } from "@/hooks/useConversations";

export default function SuperAgentMessagesPage() {
  const t = useTranslations("superAgentMessages");
  const tm = useTranslations("superAgentTeamMessage");
  const queryClient = useQueryClient();
  const [messageOpen, setMessageOpen] = useState(false);
  return (
    <>
      <UnifiedMessagesPage
        dashboardPrefix="super-agent"
        title={t("title")}
        description={t("description")}
        showNewChat={true}
        showCustomerCare={false}
        dmActions={(
          // One message to every agent in the team, or to the ones ticked.
          <Button size="sm" variant="outline" onClick={() => setMessageOpen(true)} className="gap-1.5" aria-label={tm("openButton")}>
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
            <span className="max-sm:sr-only">{tm("openButton")}</span>
          </Button>
        )}
      />
      <MessageAgentsDialog
        open={messageOpen}
        onOpenChange={setMessageOpen}
        onSent={() => { void queryClient.invalidateQueries({ queryKey: conversationKeys.lists() }); }}
      />
    </>
  );
}
