import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Conversation from "@/models/Conversation";
import ContactSubmission from "@/models/ContactSubmission";
import Webhook from "@/models/Webhook";

/**
 * GET /api/admin/action-counts — what is waiting on this admin right now.
 *
 * Support conversations are round-robin assigned to the admin with the fewest
 * open tickets (`/api/dm/customer-care`), and then excluded from `/api/dm`,
 * which is the only feed `useUnreadMessageCount` reads. The result was a queue
 * addressed to a named person that raised no badge, no bell and no count
 * anywhere in navigation — it was discoverable only by opening Messages and
 * selecting the Support tab. This endpoint is what the nav badges read.
 *
 * Shaped like `/api/job-seeker/action-counts`: one small query per counter, and
 * failures resolve to zero on the client rather than breaking the navigation.
 */
export const GET = withAuth(async (_req: NextRequest, ctx) => {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const [openSupportTickets, assignedSupportTickets, unreadContactSubmissions, failingWebhooks] =
    await Promise.all([
      Conversation.countDocuments({
        type: "customer_care",
        "customerCare.status": { $in: ["open", "assigned"] },
      }),
      // Tickets this particular admin owns. The badge shows the queue total, but
      // a personal count is what makes "assigned to me" actionable.
      Conversation.countDocuments({
        type: "customer_care",
        "customerCare.status": { $in: ["open", "assigned"] },
        "customerCare.assignedTo": ctx.userId,
      }),
      ContactSubmission.countDocuments({ isRead: false }),
      Webhook.countDocuments({ isActive: true, lastStatus: "failed" }),
    ]);

  return NextResponse.json({
    openSupportTickets,
    assignedSupportTickets,
    unreadContactSubmissions,
    failingWebhooks,
  });
}, { resource: "users", action: "read" });

export const dynamic = "force-dynamic";
