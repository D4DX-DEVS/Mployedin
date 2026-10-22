import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import ConsentLog from "@/models/ConsentLog";
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

/*
 * No POST. The legacy cookie-consent writer that lived here wrote "cookies" rows with the client IP and whatever
 * value the caller sent, with no choice reference and no match against the choice cookie, and nothing called it.
 * A signed-in user's cookie choice is logged only by POST /api/consent/receipt (one writer, no IP address).
 */
export const GET = withAuth(getHandler);
