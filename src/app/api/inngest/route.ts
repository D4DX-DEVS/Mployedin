import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
// TODO: Auto-apply inngest functions — re-enable when auto-apply feature is ready
// import { autoApplyFunction, autoApplyDailyReset } from "@/lib/inngest/autoApply";

export const { GET, POST, PUT } = serve({
  client: inngest,
  // TODO: Re-add autoApplyFunction & autoApplyDailyReset when auto-apply feature is ready
  functions: [],
});
