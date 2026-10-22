/**
 * Safety net for a stale Cookie Policy (PECR reg 6, ICO consent guidance).
 *
 * The banner and Cookie settings link to /cookies, whose body comes from the
 * CMS page "cookie-policy". Until the owner runs
 * scripts/update-legal-content.mjs --apply, that page holds the old
 * hand-written text, which describes implied consent ("By using our website,
 * you consent...") and advertising cookies the site does not use. Every policy
 * the generator builds starts with GENERATED_POLICY_MARKER; a body without it
 * (in either language), or no published page at all, is replaced here by the
 * policy generated from the same registry and messages the script would apply.
 *
 * A CMS edit that drops the marker is replaced too: the cookie policy must
 * match the registry, and the script overwrites CMS edits anyway.
 *
 * [LEGAL] This serves the generated wording publicly before --apply runs, so
 * the solicitor's sign-off of that wording is needed before this ships.
 */
import registry from "@/lib/consent/registry.json";
import enMessages from "../../../messages/en.json";
import arMessages from "../../../messages/ar.json";
import { GENERATED_POLICY_MARKER, buildCookiePolicy } from "../../../scripts/lib/cookiePolicyFromRegistry.mjs";
import logger from "@/lib/logger";

export const COOKIE_POLICY_SLUG = "cookie-policy";

/** The CMS page fields the public page API returns. */
export interface PublicLegalPage {
  slug?: string;
  title?: string;
  titleAr?: string;
  body?: string;
  bodyAr?: string;
  updatedAt?: string | Date;
}

export function hasGeneratedPolicyMarker(body: unknown): boolean {
  return typeof body === "string" && body.includes(GENERATED_POLICY_MARKER);
}

let generated: { body: string; bodyAr: string } | null = null;
const warned = new Set<string>();

/** Built once per process: the registry and messages are part of the build. */
function generatedPolicy(): { body: string; bodyAr: string } {
  generated ??= {
    body: buildCookiePolicy({ registry, messages: enMessages, locale: "en" }) as string,
    bodyAr: buildCookiePolicy({ registry, messages: arMessages, locale: "ar" }) as string,
  };
  return generated;
}

/**
 * The cookie-policy page to serve: as stored when both bodies carry the marker, otherwise with each stale body
 * (or the whole missing page) replaced by the generated policy. The stored date is dropped when anything was
 * replaced: it dates the old text, not what is shown.
 */
export function withCurrentCookiePolicy(page: PublicLegalPage | null): PublicLegalPage {
  const staleEn = !hasGeneratedPolicyMarker(page?.body);
  const staleAr = !hasGeneratedPolicyMarker(page?.bodyAr);
  if (page && !staleEn && !staleAr) return page;

  // Once per process for each kind of staleness, not on every page view.
  const state = `${Boolean(page)}:${staleEn}:${staleAr}`;
  if (!warned.has(state)) {
    warned.add(state);
    logger.warn(
      { slug: COOKIE_POLICY_SLUG, published: Boolean(page), staleEn, staleAr },
      "[legal] the CMS Cookie Policy is not the generated one, so the generated policy is served instead; " +
        "apply it with scripts/update-legal-content.mjs --apply after solicitor sign-off",
    );
  }
  const policy = generatedPolicy();
  const { updatedAt: _staleDate, ...rest } = page ?? {};
  return {
    ...rest,
    slug: COOKIE_POLICY_SLUG,
    title: page?.title || "Cookie Policy",
    titleAr: page?.titleAr || "سياسة ملفات تعريف الارتباط",
    body: staleEn ? policy.body : page?.body,
    bodyAr: staleAr ? policy.bodyAr : page?.bodyAr,
  };
}
