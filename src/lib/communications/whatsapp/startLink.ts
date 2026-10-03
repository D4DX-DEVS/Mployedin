/**
 * The "Message us on WhatsApp" link the settings pages show to a user whose
 * number is not verified yet: wa.me to the business number, with START and the
 * account's personal code typed (`START <code>`). The business number is the
 * display number of the configured WhatsApp phone, read with the Graph helper
 * the admin status route uses, and cached in memory for an hour so a settings
 * page does not call Meta on every load.
 *
 * Never a reason for the page to fail or hang: in mock mode, or when Meta
 * cannot be reached or reports no number, there is no link (null). A failed
 * lookup is retried after a few minutes, not on every load, and a slow one
 * answers null after a short wait while its result fills the cache for the
 * next load.
 *
 * The code is the account's own (startCode.ts), created here on first need by
 * ensureStartCode.
 */
import logger from "@/lib/logger";
import User from "@/models/User";
import { getPhoneNumberInfo } from "./cloudApi";
import { isWhatsAppEnabled } from "./config";
import { summarizeError } from "./redact";
import { generateStartCode } from "./startCode";

const TTL_MS = 60 * 60 * 1000;
const FAILURE_TTL_MS = 5 * 60 * 1000;
/** How long a page load waits on Meta (the Graph timeout itself is 15 s). */
const WAIT_MS = 2_000;

let cached: { digits: string | null; expiresAt: number } | null = null;
let inflight: Promise<string | null> | null = null;

/** The business number's digits, or null; concurrent callers share one lookup. */
function lookup(): Promise<string | null> {
  inflight ??= getPhoneNumberInfo()
    .then((info) => {
      const digits = info.displayPhoneNumber?.replace(/\D/g, "") || null;
      cached = { digits, expiresAt: Date.now() + (digits ? TTL_MS : FAILURE_TTL_MS) };
      return digits;
    })
    .catch((err: unknown) => {
      // The scrubbed error name only: the message could carry Meta's wording or a credential.
      logger.warn({ errorName: summarizeError(err).name }, "[whatsapp] business number lookup failed");
      cached = { digits: null, expiresAt: Date.now() + FAILURE_TTL_MS };
      return null;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export async function getWhatsAppStartLink(code: string): Promise<string | null> {
  if (!isWhatsAppEnabled()) return null;
  let digits: string | null;
  if (cached && cached.expiresAt > Date.now()) {
    digits = cached.digits;
  } else {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const wait = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), WAIT_MS);
    });
    digits = await Promise.race([lookup(), wait]);
    clearTimeout(timer);
  }
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(`START ${code}`)}` : null;
}

/** How many fresh codes a page load tries when the one it drew is already another account's (the unique index). */
const CODE_ATTEMPTS = 5;

type CodeDoc = { whatsapp?: { startCode?: string | null } | null };

/** MongoDB's duplicate-key error: here, another account already holds the code (users index on whatsapp.startCode). */
const isDuplicateKey = (err: unknown): boolean => (err as { code?: unknown } | null)?.code === 11000;

/**
 * The account's personal START code, created the first time a settings page
 * needs one. The write sets it only while the account has none, so concurrent
 * page loads end up with the same code; it stays until the phone changes to
 * another number (waId.ts). A code another account already holds is retried
 * with a fresh one. Never throws: on any failure there is no code (null), and
 * the page shows no button. The log lines carry neither the code nor the error
 * text.
 */
export async function ensureStartCode(userId: string): Promise<string | null> {
  try {
    for (let attempt = 1; attempt <= CODE_ATTEMPTS; attempt += 1) {
      try {
        // `"whatsapp.startCode": null` matches a missing code too.
        const set = (await User.findOneAndUpdate(
          { _id: userId, "whatsapp.startCode": null },
          { $set: { "whatsapp.startCode": generateStartCode() } },
          { returnDocument: "after" },
        )
          .select("whatsapp.startCode")
          .lean()) as CodeDoc | null;
        if (set) return set.whatsapp?.startCode ?? null;
        // Missed: the account already has a code (a concurrent load stored it first), or there is no such account.
        const stored = (await User.findById(userId).select("whatsapp.startCode").lean()) as CodeDoc | null;
        return stored?.whatsapp?.startCode ?? null;
      } catch (err) {
        if (!isDuplicateKey(err)) throw err;
      }
    }
    logger.warn({ userId }, "[whatsapp] no free START code after several tries");
  } catch (err) {
    logger.warn({ userId, errorName: summarizeError(err).name }, "[whatsapp] could not create the START code");
  }
  return null;
}

/** Tests only: forget the cached number. */
export function resetWhatsAppStartLinkCache(): void {
  cached = null;
  inflight = null;
}
