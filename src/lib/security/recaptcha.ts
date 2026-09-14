import logger from "@/lib/logger";

/**
 * Server-side reCAPTCHA v3 verification.
 *
 * Mirrors the policy already used by /api/contact: when RECAPTCHA_SECRET_KEY is
 * configured the check is mandatory and fails closed; when it is not configured
 * the check is skipped, so environments without keys keep working unchanged.
 *
 * v3 is invisible — the visitor never solves anything. Google returns a score;
 * we refuse below `minScore` (default 0.3, same as the contact form).
 *
 * Stricter than the contact form in two ways, both learned the hard way:
 *  - `score` and `action` are REQUIRED. A v2 key (Google's public demo pair
 *    included) returns neither and reports success for anything, so treating
 *    them as optional would let a leftover demo key turn the gate into a no-op
 *    while it looks configured.
 *  - The default allowed hostname comes from the configured site URL
 *    (NEXTAUTH_URL / NEXT_PUBLIC_BASE_URL / NEXT_PUBLIC_APP_URL), not from the
 *    request's Host header, which the caller controls. RECAPTCHA_ALLOWED_HOSTS
 *    (comma list) overrides it for multi-domain setups.
 */
export type RecaptchaResult =
  | { ok: true; skipped: boolean; score?: number }
  | { ok: false; status: 403 | 503; error: "CAPTCHA_REQUIRED" | "CAPTCHA_FAILED" | "CAPTCHA_UNAVAILABLE" };

export interface VerifyRecaptchaOptions {
  /** The action name the client passed to grecaptcha.execute(). */
  action: string;
  /** Request hostname; used only when no site URL is configured at all. */
  hostname: string;
  minScore?: number;
}

export function isRecaptchaConfigured(): boolean {
  return Boolean(process.env.RECAPTCHA_SECRET_KEY);
}

/** Hostnames a token may have been minted on, lower-cased. */
export function recaptchaAllowedHosts(requestHostname: string): string[] {
  const override = process.env.RECAPTCHA_ALLOWED_HOSTS;
  if (override) {
    return override
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean);
  }
  const configured = [process.env.NEXTAUTH_URL, process.env.NEXT_PUBLIC_BASE_URL, process.env.NEXT_PUBLIC_APP_URL]
    .filter((u): u is string => Boolean(u))
    .map((u) => {
      try {
        return new URL(u).hostname.toLowerCase();
      } catch {
        return null;
      }
    })
    .filter((h): h is string => Boolean(h));
  return configured.length ? Array.from(new Set(configured)) : [requestHostname.toLowerCase()];
}

export async function verifyRecaptcha(
  token: string | undefined | null,
  opts: VerifyRecaptchaOptions,
): Promise<RecaptchaResult> {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) return { ok: true, skipped: true };

  if (!token) return { ok: false, status: 403, error: "CAPTCHA_REQUIRED" };

  const minScore = opts.minScore ?? 0.3;
  const allowedHosts = recaptchaAllowedHosts(opts.hostname);

  try {
    const params = new URLSearchParams();
    params.append("secret", secret);
    params.append("response", token);
    const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    if (!res.ok) throw new Error(`CAPTCHA service returned ${res.status}`);

    const data = (await res.json()) as {
      success?: boolean;
      score?: number;
      action?: string;
      hostname?: string;
      "error-codes"?: string[];
    };

    const reason = !data.success
      ? "not_success"
      : typeof data.score !== "number"
        ? "no_score_not_v3"
        : data.score < minScore
          ? "low_score"
          : data.action !== opts.action
            ? "action_mismatch"
            : typeof data.hostname !== "string" || !allowedHosts.includes(data.hostname.toLowerCase())
              ? "hostname_not_allowed"
              : null;

    if (reason) {
      logger.warn(
        {
          reason,
          score: data.score,
          action: data.action,
          hostname: data.hostname,
          expectedAction: opts.action,
          allowedHosts,
          errorCodes: data["error-codes"],
        },
        "[reCAPTCHA] verification refused",
      );
      return { ok: false, status: 403, error: "CAPTCHA_FAILED" };
    }
    return { ok: true, skipped: false, score: data.score };
  } catch (err) {
    // Fail closed, but distinguish "Google is down" from "you are a bot" so the
    // client can show the right message.
    logger.warn({ err }, "[reCAPTCHA] service unavailable");
    return { ok: false, status: 503, error: "CAPTCHA_UNAVAILABLE" };
  }
}
