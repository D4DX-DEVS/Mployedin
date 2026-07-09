import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { notificationOrchestrator } from "@/lib/inngest/notificationOrchestrator";
import { dailyRecommendationsCron } from "@/lib/inngest/dailyRecommendations";
import { dailyDigestWorker } from "@/lib/inngest/dailyDigestWorker";
import { reEngagementCron, profileCompletionCron } from "@/lib/inngest/reEngagement";
import { weeklyDigestCron } from "@/lib/inngest/weeklyDigest";
import { jobExpiryAlertsCron } from "@/lib/inngest/jobExpiryAlerts";
import { similarJobsAfterApply } from "@/lib/inngest/similarJobsEmail";
import { aiScreenApplication } from "@/lib/inngest/aiScreenApplication";
import { emailSequenceSenderCron } from "@/lib/inngest/emailSequenceSender";
import { extractionDraftExpiryCron } from "@/lib/inngest/extractionDraftExpiry";
import { aiChatDraftExpiryCron } from "@/lib/inngest/aiChatDraftExpiry";
import { scheduledCronFunctions } from "@/lib/inngest/scheduledCrons";
import { adminBroadcastSender } from "@/lib/inngest/adminBroadcast";
// TODO: Re-add autoApplyFunction & autoApplyDailyReset when auto-apply feature is ready
// import { autoApplyFunction, autoApplyDailyReset } from "@/lib/inngest/autoApply";

// Route is intentionally public: the Inngest SDK's serve() verifies the
// HMAC signature of every request against INNGEST_SIGNING_KEY before
// dispatching to any function (https://www.inngest.com/docs/platform/signing-keys).
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
    similarJobsAfterApply,
    aiScreenApplication,
    emailSequenceSenderCron,
    // Expires abandoned AI extraction drafts after their 7-day window.
    extractionDraftExpiryCron,
    // Expires abandoned AI job-creator chat drafts after their 7-day window.
    aiChatDraftExpiryCron,
    // Scheduled crons migrated off GitHub Actions (replaces scheduled-crons.yml)
    ...scheduledCronFunctions,
    // Delivers admin broadcasts off the request path (100k+ recipients).
    adminBroadcastSender,
  ],
});
