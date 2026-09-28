import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { validateBody } from "@/lib/validators";
import { getClientIp } from "@/lib/security/clientIp";
import ConsentLog from "@/models/ConsentLog";
import User from "@/models/User";
import { CONSENT_TYPES } from "@/lib/gdpr/consent";

/** The consents the Data & Privacy page shows: legal first, cookies apart. */
const SHOWN_CONSENTS = [CONSENT_TYPES.termsAndPrivacy, CONSENT_TYPES.cookies] as const;

export interface ConsentState {
  granted: boolean;
  at: string;
  source: string | null;
}

/**
 * GET /api/user/consent — the latest recorded answer for each shown consent,
 * or null when none was ever recorded (accounts older than consent logging).
 */
async function getHandler(_req: NextRequest, ctx: AuthContext) {
  await connectDB();
  const latest = await Promise.all(
    SHOWN_CONSENTS.map((consentType) =>
      ConsentLog.findOne({ userId: ctx.userId, consentType })
        .sort({ createdAt: -1 })
        .select("granted createdAt source")
        .lean<{ granted?: boolean; createdAt?: Date; source?: string } | null>(),
    ),
  );
  const consents: Record<string, ConsentState | null> = {};
  SHOWN_CONSENTS.forEach((consentType, i) => {
    const row = latest[i];
    consents[consentType] = row
      ? { granted: Boolean(row.granted), at: new Date(row.createdAt ?? Date.now()).toISOString(), source: row.source ?? null }
      : null;
  });
  return NextResponse.json({ consents });
}

/**
 * POST /api/user/consent — a signed-in user answered the cookie banner or
 * changed it on their Data & Privacy page.
 *
 * Cookies only. Terms & Privacy acceptance is recorded where it is given — at
 * sign-up — and marketing consent by the profile that holds the flag; a row
 * written here would not change either.
 *
 * Anonymous visitors keep their choice in the browser only; it reaches the
 * consent log when they register (see recordRegistrationConsents).
 */
const cookieConsentSchema = z.object({
  consentType: z.literal(CONSENT_TYPES.cookies),
  granted: z.boolean(),
  source: z.enum(["cookie_banner", "privacy_settings"]).optional(),
});

async function postHandler(req: NextRequest, ctx: AuthContext) {
  const { consentType, granted, source } = await validateBody(req, cookieConsentSchema);
  await connectDB();
  const user = (await User.findById(ctx.userId).select("name").lean()) as { name?: string } | null;
  await ConsentLog.create({
    userId: ctx.userId,
    userName: user?.name ?? "Unknown",
    consentType,
    granted,
    source: source ?? "cookie_banner",
    ipAddress: getClientIp(req.headers),
  });
  return NextResponse.json({ success: true });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
