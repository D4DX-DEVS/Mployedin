import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { connectDB } from "@/lib/db/mongoose";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { getClientIp, FALLBACK_CLIENT } from "@/lib/security/clientIp";
import { bannerTextHash } from "@/lib/consent/bannerTextHash";
import { RECEIPT_ID_PATTERN } from "@/lib/consent/receiptId";
import { getConsent } from "@/lib/consent/server";
import { CONSENT_VERSION } from "@/lib/consent/state";
import { recordCookieConsent } from "@/lib/gdpr/consent";
import { COOKIE_CHOICE_SOURCES } from "@/lib/gdpr/cookieChoiceOutcome";
import ConsentReceipt from "@/models/ConsentReceipt";
import logger from "@/lib/logger";

const PER_CLIENT_LIMIT = { limit: 10, windowSec: 60, prefix: "consent-receipt" };
/**
 * Keyed on FALLBACK_CLIENT, which getClientIp answers when no trusted proxy is
 * configured: one shared key for every visitor. A per-visitor limit keyed on it
 * would let ten receipts a minute through for the whole site and silently drop
 * the rest, so this is a flood guard for the whole site, not a per-visitor cap.
 */
const GLOBAL_LIMIT = { limit: 600, windowSec: 60, prefix: "consent-receipt-global" };

// Unknown keys are dropped, so nothing else a client sends (an IP, a user
// agent, a user id) can reach the receipt.
const receiptSchema = z.object({
  /** The id writeConsent() puts in mpl_consent; the shared pattern is lib/consent/receiptId. */
  receiptId: z.string().max(36).regex(RECEIPT_ID_PATTERN),
  preferences: z.boolean(),
  media: z.boolean(),
  /** Only the current CONSENT_VERSION: a choice made under an older one is no longer a choice in force. */
  version: z.literal(CONSENT_VERSION),
  locale: z.enum(["en", "ar"]),
  /**
   * Where the choice was made. Stored on the receipt only when sent (an absent
   * one shows as "Not recorded", never assumed); a signed-in user's account
   * log keeps its old default of "banner".
   */
  source: z.enum(COOKIE_CHOICE_SOURCES).optional(),
});

/**
 * POST /api/consent/receipt: the cookie banner or Cookie settings dialog
 * stored a choice in `mpl_consent`. Public (visitors choose before they have an
 * account); CSRF is checked by the proxy and the client sends it via csrfFetch.
 *
 * The log must say what the browser actually stored, so the request's own
 * `mpl_consent` cookie is read (recordConsentChoice writes it before it posts,
 * and a same-origin POST carries it) and must hold this choice: the same
 * reference and the same two answers. If the cookie is missing (a browser that
 * blocks cookies has no choice in effect), unreadable, from an older consent
 * version, or different, the answer is 409 and nothing is stored. A body
 * `version` other than the current CONSENT_VERSION is a 400.
 *
 * Then writes a minimised ConsentReceipt (the choice, where it was made and a
 * hash of the wording; no IP, user agent or user id; the IP is only the
 * rate-limit key, never stored), and, when a session exists, the account's
 * ConsentLog rows. Idempotent per choice reference: a receipt sent again (the
 * client resends one that failed to deliver) answers 204 again and neither the
 * receipt nor the account rows are written twice. Fire-and-forget on the
 * client: 204, no body; the client retries only a 429 or 5xx, never a 409.
 */
export async function POST(req: NextRequest) {
  const client = getClientIp(req.headers);
  const { allowed } = await checkRateLimit(client, client === FALLBACK_CLIENT ? GLOBAL_LIMIT : PER_CLIENT_LIMIT);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const parsed = receiptSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { receiptId, preferences, media, version, locale, source } = parsed.data;

  const stored = await getConsent();
  if (!stored || stored.id !== receiptId || stored.preferences !== preferences || stored.media !== media) {
    return NextResponse.json({ error: "This cookie choice doesn't match the one stored in this browser." }, { status: 409 });
  }

  // One receipt per choice reference. The client sends a receipt again when an earlier delivery failed
  // (a retry, or the next page load), so storing must be idempotent: an upsert that writes only when the
  // reference is new, and a duplicate-key error (two requests racing to insert it) counts as stored.
  try {
    await connectDB();
    await ConsentReceipt.updateOne(
      { receiptId },
      {
        $setOnInsert: {
          receiptId,
          preferences,
          media,
          version,
          locale,
          ...(source ? { source } : {}),
          bannerTextHash: bannerTextHash(locale),
        },
      },
      { upsert: true, runValidators: true },
    );
  } catch (err) {
    if ((err as { code?: number } | null)?.code !== 11000) {
      logger.error({ err }, "[consent] couldn't store a consent receipt");
      return NextResponse.json({ error: "We couldn't save your cookie choice." }, { status: 500 });
    }
  }

  // Optional session: a visitor's choice reaches their account log when they register.
  const session = await auth().catch(() => null);
  const userId = session?.user?.id;
  if (userId) {
    await recordCookieConsent({ userId, receiptId, preferences, media, source: source ?? "banner" });
  }

  return new NextResponse(null, { status: 204 });
}
