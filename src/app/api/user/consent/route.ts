import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { validateBody } from "@/lib/validators";
import { getClientIp } from "@/lib/security/clientIp";
import ConsentLog from "@/models/ConsentLog";
import User from "@/models/User";
import { CONSENT_TYPES } from "@/lib/gdpr/consent";

/**
 * POST /api/user/consent — a signed-in user answered the cookie banner.
 *
 * Anonymous visitors keep their choice in the browser only; it reaches the
 * consent log when they register (see recordRegistrationConsents).
 */
const cookieConsentSchema = z.object({
  consentType: z.literal(CONSENT_TYPES.cookies),
  granted: z.boolean(),
});

async function postHandler(req: NextRequest, ctx: AuthContext) {
  const { consentType, granted } = await validateBody(req, cookieConsentSchema);
  await connectDB();
  const user = (await User.findById(ctx.userId).select("name").lean()) as { name?: string } | null;
  await ConsentLog.create({
    userId: ctx.userId,
    userName: user?.name ?? "Unknown",
    consentType,
    granted,
    source: "cookie_banner",
    ipAddress: getClientIp(req.headers),
  });
  return NextResponse.json({ success: true });
}

export const POST = withAuth(postHandler);
