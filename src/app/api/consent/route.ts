import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { connectDB } from "@/lib/db/mongoose";
import { validateBody } from "@/lib/validators";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { getClientIp } from "@/lib/security/clientIp";
import logger from "@/lib/logger";
import CookieConsentRecord from "@/models/CookieConsentRecord";
import {
  CONSENT_METHODS,
  CONSENT_POLICY_VERSION,
  needsConsentPrompt,
} from "@/lib/consent/config";
import { consentFromRequest } from "@/lib/consent/server";

/**
 * Cookie consent records — public, no auth required (anonymous visitors must be
 * able to consent). CSRF is enforced by the proxy like every other mutation.
 *
 * POST: append a proof-of-consent row for the choice the browser just stored.
 * GET:  the latest recorded choice for this browser's consent id, or — for a
 *       signed-in user on a new device — for their account, so the choice
 *       follows the account instead of re-asking on every device.
 */

const consentSchema = z.object({
  consentId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
  policyVersion: z.string().regex(/^[0-9-]{4,20}$/),
  choices: z.object({
    functional: z.boolean(),
    analytics: z.boolean(),
    marketing: z.boolean(),
  }),
  method: z.enum(CONSENT_METHODS),
  gpc: z.boolean().optional().default(false),
  locale: z.string().max(10).optional(),
  pageUrl: z.string().max(300).optional(),
});

/** Salted hash of the truncated IP (IPv4 /24, IPv6 /48) — abuse signal only. */
function hashIp(ip: string): string | undefined {
  if (!ip || ip === "direct") return undefined;
  const truncated = ip.includes(":")
    ? ip.split(":").slice(0, 3).join(":")
    : ip.split(".").slice(0, 3).join(".");
  const salt = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET ?? "mployedin-consent";
  return crypto.createHmac("sha256", salt).update(truncated).digest("hex").slice(0, 32);
}

async function sessionUserId(): Promise<string | undefined> {
  try {
    const session = await auth();
    const id = (session?.user as { id?: string } | undefined)?.id;
    return id && mongoose.Types.ObjectId.isValid(id) ? id : undefined;
  } catch {
    return undefined;
  }
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req.headers);
    const { allowed } = await checkRateLimit(`consent:${ip}`, { limit: 30, windowSec: 600, prefix: "consent" });
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await validateBody(req, consentSchema);
    const gpcHeader = req.headers.get("sec-gpc") === "1";
    const gpc = body.gpc || gpcHeader;
    // A GPC signal is an opt-out of sale/sharing; never record marketing as
    // granted through a one-click "accept all" while it is present.
    const marketing = gpc && body.method === "accept_all" ? false : body.choices.marketing;

    await connectDB();
    const userId = await sessionUserId();

    await CookieConsentRecord.create({
      consentId: body.consentId,
      userId,
      policyVersion: body.policyVersion,
      choices: { necessary: true, functional: body.choices.functional, analytics: body.choices.analytics, marketing },
      method: body.method,
      gpc,
      locale: body.locale,
      pageUrl: body.pageUrl?.split("?")[0],
      userAgent: req.headers.get("user-agent")?.slice(0, 300) ?? undefined,
      ipHash: hashIp(ip),
      country: (req.headers.get("cf-ipcountry") ?? req.headers.get("x-vercel-ip-country") ?? "").slice(0, 2).toUpperCase() || undefined,
    });

    const res = NextResponse.json({ ok: true, policyVersion: CONSENT_POLICY_VERSION });
    // Withdrawal must stop what already runs: drop first-party analytics
    // cookies we control (httpOnly ones can only be cleared server-side).
    if (!body.choices.analytics) {
      res.cookies.set("jv", "", { path: "/", maxAge: 0 });
    }
    return res;
  } catch (error) {
    if (error instanceof NextResponse) return error;
    logger.error({ error }, "[Consent] Failed to record consent");
    return NextResponse.json({ error: "Failed to record consent" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const local = consentFromRequest(req);
    const userId = await sessionUserId();
    if (!local && !userId) return NextResponse.json({ consent: null });

    await connectDB();
    const filter = local ? { consentId: local.id } : { userId };
    const latest = await CookieConsentRecord.findOne(filter)
      .sort({ createdAt: -1 })
      .select("consentId policyVersion choices method gpc createdAt")
      .lean();

    if (!latest) return NextResponse.json({ consent: null });

    const state = {
      id: latest.consentId,
      version: latest.policyVersion,
      timestamp: new Date(latest.createdAt).getTime(),
      choices: {
        functional: latest.choices.functional,
        analytics: latest.choices.analytics,
        marketing: latest.choices.marketing,
      },
      method: latest.method,
      gpc: latest.gpc,
    };
    return NextResponse.json(
      { consent: needsConsentPrompt(state) ? null : state },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    logger.error({ error }, "[Consent] Failed to load consent");
    return NextResponse.json({ consent: null });
  }
}
