/**
 * Scrubs credentials out of an error message before it leaves the server (an
 * API response). Node's fetch echoes a malformed Authorization header back in
 * its TypeError (`Headers.append: "Bearer …" is an invalid header value.`), so a
 * non-Graph error message is only safe to relay once it has been through this.
 *
 * Reads process.env itself, not config.ts, so it has no dependency to mock or break.
 */
const SECRET_ENV = ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_APP_SECRET", "WHATSAPP_WEBHOOK_VERIFY_TOKEN"] as const;

/** Anything shorter is too likely to be a common word to blank out of a message. */
const MIN_SECRET_LENGTH = 8;

export function redactSecrets(text: string): string {
  // Up to the closing quote, not the next space: a token with a stray space or control character in it is exactly the case that gets echoed.
  let out = text.replace(/Bearer\s+[^"']*/gi, "Bearer [redacted]");
  for (const name of SECRET_ENV) {
    const value = process.env[name]?.trim();
    if (value && value.length >= MIN_SECRET_LENGTH) out = out.split(value).join("[redacted]");
  }
  return out;
}

export interface ErrorSummary {
  name: string;
  /** Scrubbed. */
  message: string;
  /** A system code such as ECONNREFUSED, from the error or its `cause`; scrubbed. */
  causeCode?: string;
}

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>)[key] : undefined;
}

/**
 * What is safe to log or store about a thrown value: its name, scrubbed message and
 * system code, never the stack or the `cause` object (both repeat the message).
 * Duck-typed on purpose: errors raised inside Node's fetch come from another realm
 * under Jest and fail `instanceof Error`.
 */
export function summarizeError(err: unknown): ErrorSummary {
  const rawMessage = field(err, "message");
  const rawName = field(err, "name");
  const code = field(field(err, "cause"), "code") ?? field(err, "code");
  return {
    name: typeof rawName === "string" && rawName ? rawName : "Error",
    message: redactSecrets(typeof rawMessage === "string" ? rawMessage : String(err)),
    causeCode: typeof code === "string" && code ? redactSecrets(code) : undefined,
  };
}

/**
 * A fresh Error carrying only the summary: same `name` (so TimeoutError / AbortError can
 * still be told apart) and, when there is one, `cause: { code }`. It is what leaves the
 * transport layer, so no caller can log or store the original, token-bearing error.
 */
export function scrubError(err: unknown): Error {
  const { name, message, causeCode } = summarizeError(err);
  const out = new Error(message);
  out.name = name;
  if (causeCode) out.cause = { code: causeCode };
  return out;
}
