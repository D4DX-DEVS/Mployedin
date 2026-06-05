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
    // Strip "ignore/forget/disregard/override (all) previous instructions" overrides
    .replace(/\b(ignore|forget|disregard|override)\s+(all\s+|any\s+|the\s+)?(previous|above|prior|earlier|preceding)\s+(instructions?|prompts?|context|rules?|messages?)/gi, "[filtered]")
    // Strip "new/updated system prompt" overrides (requires "system" to avoid
    // matching legitimate phrases like "new rules" in job text)
    .replace(/\b(new|updated|revised|ignore\s+the)\s+system\s+(prompt|instructions?|rules?|message)/gi, "[filtered]")
    // Strip explicit persona resets (high-precision — avoids common job phrases
    // like "act as a liaison" / "behave as")
    .replace(/\b(you\s+are\s+now|roleplay\s+as|pretend\s+(you\s+are|to\s+be))\b/gi, "[filtered]")
    // Strip well-known jailbreak handles
    .replace(/\b(do\s+anything\s+now|developer\s+mode|jailbreak)\b/gi, "[filtered]")
    // Strip faked conversation turns at line starts (system:/assistant: markers)
    .replace(/(^|\n)\s*\[?(system|assistant|inst|sys)\]?\s*:/gi, "$1[filtered]:")
    // Strip residual system prompt override tags anywhere
    .replace(/\[?(SYSTEM|INST|SYS|\/INST)\]?\s*:?\s*/gi, "");

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
  // Email addresses (safe to redact from analytical AI output)
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
];

/**
 * Run basic PII detection on AI output.
 * Returns true if potential PII is found.
 */
export function detectPII(text: string): boolean {
  return PII_PATTERNS.some((pattern) => {
    // Global-flagged regexes carry `lastIndex` state across .test() calls; reset
    // before each use so detection is deterministic.
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}

/**
 * Redact detected PII patterns from text.
 */
export function redactPII(text: string): string {
  let result = text;
  for (const pattern of PII_PATTERNS) {
    pattern.lastIndex = 0;
    result = result.replace(pattern, "[REDACTED]");
  }
  return result;
}
