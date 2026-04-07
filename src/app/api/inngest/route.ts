import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { autoApplyFunction, autoApplyDailyReset } from "@/lib/inngest/autoApply";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [autoApplyFunction, autoApplyDailyReset],
});
