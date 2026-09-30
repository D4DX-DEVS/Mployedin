import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { validateBody } from "@/lib/validators";
import { getClientIp } from "@/lib/security/clientIp";
import { acceptCurrentTerms } from "@/lib/gdpr/consent";
import logger from "@/lib/logger";

/**
 * POST /api/user/terms-acceptance — the signed-in user ticked "I agree" on
 * /accept-terms. Records a terms_and_privacy row with the version accepted
 * (admin GDPR page → Consent Logs) and stores the version on the user, which
 * the page then pushes into the session with update({ termsAccepted: true }).
 *
 * Idempotent: accepting a version already accepted writes nothing.
 */
const acceptSchema = z.object({ accepted: z.literal(true) });

async function postHandler(req: NextRequest, ctx: AuthContext) {
  await validateBody(req, acceptSchema);
  await connectDB();
  try {
    const result = await acceptCurrentTerms({ userId: ctx.userId, ipAddress: getClientIp(req.headers) });
    return NextResponse.json({ success: true, version: result.version });
  } catch (err) {
    logger.error({ err, userId: ctx.userId }, "[gdpr] terms acceptance not recorded");
    return NextResponse.json(
      { error: "We couldn't record your acceptance. Please try again." },
      { status: 500 },
    );
  }
}

export const POST = withAuth(postHandler);
