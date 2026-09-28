import type { NextRequest } from "next/server";
import type { AuthContext } from "@/lib/auth/withAuth";
import User from "@/models/User";
import GdprRequest from "@/models/GdprRequest";
import { getClientIp } from "@/lib/security/clientIp";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { notifyAdminsGdprDeletionRequest } from "@/lib/notifications/trigger";
import logger from "@/lib/logger";

export type DeletionRequestResult =
  | { ok: true; requestId: string }
  | { ok: false; code: "ADMIN_ACCOUNT" | "REQUEST_OPEN" };

/**
 * A user asks for their account to be erased. Nothing is erased here: the
 * request waits in the admin GDPR register, and completing it there runs
 * eraseUserPersonalData. One open request per user; admins can't ask (their
 * accounts are never erased — see the admin PATCH route).
 */
export async function createDeletionRequest(
  req: NextRequest,
  ctx: AuthContext,
  reason?: string,
): Promise<DeletionRequestResult> {
  if (ctx.role === "admin") return { ok: false, code: "ADMIN_ACCOUNT" };

  const open = await GdprRequest.findOne({
    userId: ctx.userId,
    requestType: "delete",
    status: { $in: ["pending", "in_progress"] },
  })
    .select("_id")
    .lean();
  if (open) return { ok: false, code: "REQUEST_OPEN" };

  const user = (await User.findById(ctx.userId).select("name email").lean()) as { name?: string; email?: string } | null;
  const userName = user?.name || "Unknown";

  const request = await GdprRequest.create({
    userId: ctx.userId,
    userName,
    // userEmail is required; a session always has a user with an e-mail.
    userEmail: user?.email || "unknown",
    requestType: "delete",
    status: "pending",
    ...(reason ? { notes: reason } : {}),
    ipAddress: getClientIp(req.headers),
  });
  const requestId = String(request._id);

  await logActivity({
    ...actorFromCtx(ctx),
    action: "gdpr.deletion_requested",
    resource: "gdpr",
    resourceId: requestId,
    meta: { requestType: "delete", subjectUserId: ctx.userId },
    req,
  });

  try {
    await notifyAdminsGdprDeletionRequest(userName, requestId);
  } catch (err) {
    // The request is saved and shows in the register; only the bell is missed.
    logger.error({ err, requestId }, "[gdpr] could not notify admins of a deletion request");
  }

  return { ok: true, requestId };
}
