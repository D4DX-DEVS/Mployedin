import type { NextRequest } from "next/server";
import type { AuthContext } from "@/lib/auth/withAuth";
import User from "@/models/User";
import GdprRequest from "@/models/GdprRequest";
import { getClientIp } from "@/lib/security/clientIp";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { notifyAdminsPrivacyComplaint } from "@/lib/notifications/trigger";
import logger from "@/lib/logger";


/**
 * [LEGAL] Data (Use and Access) Act 2025, from 19 June 2026: a controller must
 * let people complain about how their personal data is used, acknowledge the
 * complaint within 30 days and answer it without undue delay. The complaint
 * waits in the admin GDPR register like any other request; the team answers
 * through the request's outcome, which the person sees on Data & Privacy.
 */
export async function createPrivacyComplaint(req: NextRequest, ctx: AuthContext, message: string): Promise<string> {
  const user = (await User.findById(ctx.userId).select("name email").lean()) as { name?: string; email?: string } | null;
  const userName = user?.name || "Unknown";

  const request = await GdprRequest.create({
    userId: ctx.userId,
    userName,
    userEmail: user?.email || "unknown",
    requestType: "complaint",
    status: "pending",
    notes: message,
    ipAddress: getClientIp(req.headers),
  });
  const requestId = String(request._id);

  await logActivity({
    ...actorFromCtx(ctx),
    action: "gdpr.complaint_received",
    resource: "gdpr",
    resourceId: requestId,
    meta: { requestType: "complaint", subjectUserId: ctx.userId },
    req,
  });

  try {
    await notifyAdminsPrivacyComplaint(userName, requestId);
  } catch (err) {
    logger.error({ err, requestId }, "[gdpr] couldn't notify admins of a privacy complaint");
  }
  return requestId;
}
