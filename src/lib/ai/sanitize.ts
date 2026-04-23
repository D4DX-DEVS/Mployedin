/**
 * AI input sanitization and security utilities.
 *
 * Prevents prompt injection, controls costs, and filters PII from output.
 */

/**
 * Strip dangerous control characters and prompt injection patterns.
 */
export function sanitizeAIInput(input: string, maxLength = 4000): string {
  let cleaned = input
    // Remove null bytes
    .replace(/\0/g, "")
    // Remove other control characters (except newline, tab, carriage return)
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    // Strip common prompt injection prefixes
    .replace(/^(ignore|forget|disregard)\s+(all\s+)?(previous|above|prior)\s+(instructions?|prompts?|context)/gi, "[filtered]")
    // Strip system prompt override attempts
    .replace(/\[?(SYSTEM|INST|SYS)\]?\s*:?\s*/gi, "");

  // Enforce max length
  if (cleaned.length > maxLength) {
    cleaned = cleaned.slice(0, maxLength);
  }

  return cleaned.trim();
}

/**
 * Sanitize an array of chat messages.
 */
export function sanitizeChatMessages(
  messages: { role: string; content: string }[],
  maxMessages = 50,
  maxContentLength = 4000
): { role: string; content: string }[] {
  return messages.slice(0, maxMessages).map((msg) => ({
    role: msg.role,
    content: sanitizeAIInput(msg.content, maxContentLength),
  }));
}

/** Max token limits by AI task category */
export const AI_TOKEN_LIMITS: Record<string, number> = {
  chat: 2000,
  job_description: 3000,
  poster_design: 2000,
  poster_layout: 4000,
  cv_extract: 16000,
  report: 2000,
  nl_search: 1000,
  match: 2000,
  skills_gap: 2000,
  skills_suggest: 1000,
  daily_insights: 2000,
};

/**
 * Common PII patterns for basic detection in AI output.
 * Not exhaustive — catches obvious leaks only.
 */
const PII_PATTERNS = [
  // SSN-like
  /\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/g,
  // Credit card numbers (simple check)
  /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
  // Passport-like (2 letters + 7 digits)
  /\b[A-Z]{2}\d{7}\b/g,
];

/**
 * Run basic PII detection on AI output.
 * Returns true if potential PII is found.
 */
export function detectPII(text: string): boolean {
  return PII_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Redact detected PII patterns from text.
 */
export function redactPII(text: string): string {
  let result = text;
  for (const pattern of PII_PATTERNS) {
    result = result.replace(pattern, "[REDACTED]");
  }
  return result;
}
