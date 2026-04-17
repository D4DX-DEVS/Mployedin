import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { notificationOrchestrator } from "@/lib/inngest/notificationOrchestrator";
import { dailyRecommendationsCron } from "@/lib/inngest/dailyRecommendations";
import { dailyDigestWorker } from "@/lib/inngest/dailyDigestWorker";
import { reEngagementCron, profileCompletionCron } from "@/lib/inngest/reEngagement";
import { weeklyDigestCron } from "@/lib/inngest/weeklyDigest";
import { jobExpiryAlertsCron } from "@/lib/inngest/jobExpiryAlerts";
// TODO: Re-add autoApplyFunction & autoApplyDailyReset when auto-apply feature is ready
// import { autoApplyFunction, autoApplyDailyReset } from "@/lib/inngest/autoApply";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    notificationOrchestrator,
    dailyRecommendationsCron,
    dailyDigestWorker,
    reEngagementCron,
    profileCompletionCron,
    weeklyDigestCron,
    jobExpiryAlertsCron,
  ],
});
