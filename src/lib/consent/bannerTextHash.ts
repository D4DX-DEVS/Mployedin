import "server-only";
import { createHash } from "node:crypto";
import en from "../../../messages/en.json";
import ar from "../../../messages/ar.json";
import { consentCopyKeys } from "./copy";

export type ConsentLocale = "en" | "ar";

const MESSAGES: Record<ConsentLocale, unknown> = { en, ar };

function resolve(messages: unknown, key: string): string | null {
  const value = key.split(".").reduce<unknown>(
    (node, part) => (node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined),
    messages,
  );
  return typeof value === "string" ? value : null;
}

const cache = new Map<ConsentLocale, string>();

/**
 * sha256 (hex) of the banner and Cookie settings text in one locale, read from
 * messages/<locale>.json in the fixed order of consentCopyKeys(). A receipt
 * stores it so the record shows which wording the choice was made against.
 * Key and text are hashed together, so moving a string to another key also
 * counts as a change. Computed once per locale per server process.
 */
export function bannerTextHash(locale: ConsentLocale): string {
  const cached = cache.get(locale);
  if (cached) return cached;
  const pairs = consentCopyKeys().map((key) => [key, resolve(MESSAGES[locale], key)]);
  const hash = createHash("sha256").update(JSON.stringify(pairs)).digest("hex");
  cache.set(locale, hash);
  return hash;
}
