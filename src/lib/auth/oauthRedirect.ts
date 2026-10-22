import { LOCALE_QUERY_PARAM, isSupportedLocale } from "@/lib/i18n/localePath";
import { withCallback } from "@/lib/routing/callbackUrl";
import { normalizeReferralCode } from "@/lib/referrals/url";

/** Where an OAuth sign-in (LinkedIn, Apple) lands; it reads the session and sends the person to their home. */
export const POST_LOGIN_REDIRECT_PATH = "/api/auth/post-login-redirect";

/** The query parameter that carries a referral code on that URL (and on the consent_required bounce). */
export const REFERRAL_QUERY_PARAM = "ref";

/**
 * The `callbackUrl` for an OAuth start on the login and register pages.
 *
 * The provider's callback is a request from the provider, with none of our
 * pages in it, so the only thing that can tell the server which language the
 * visitor started in is this URL (Auth.js keeps it in its callback-url cookie;
 * resolveCallbackLocale reads it). NEXT_LOCALE cannot do it: it is a preference
 * cookie, and a visitor who refused display settings has none. So the page
 * locale is always added as `locale=<en|ar>`, after the callback when there is
 * one: `/api/auth/post-login-redirect?callbackUrl=%2Far%2Fjobs%2Fabc&locale=ar`.
 *
 * `locale` is written only when it is one of the supported locales, so the URL
 * can never carry a free string. `callbackPath` must already be a safe path
 * (safeCallbackPath); /api/auth/post-login-redirect checks it again.
 *
 * `referralCode` is the `?ref=` code a visitor arrived with, held in page memory
 * (referrals/pendingReferral): a sign-up started on the login page has no
 * mpl_signup_consent cookie on its first attempt, so the code travels in this URL
 * (and in Auth.js's callback-url cookie, from which the consent_required bounce
 * reads it back: resolveCallbackReferral). It is written only when it has the
 * shape of a code; post-login-redirect and the attach helper check it again.
 */
export function oauthRedirectUrl(locale: string, callbackPath?: string | null, referralCode?: string | null): string {
  let url = withCallback(POST_LOGIN_REDIRECT_PATH, callbackPath);
  if (isSupportedLocale(locale)) url = `${url}${url.includes("?") ? "&" : "?"}${LOCALE_QUERY_PARAM}=${locale}`;
  const ref = normalizeReferralCode(referralCode);
  if (ref) url = `${url}${url.includes("?") ? "&" : "?"}${REFERRAL_QUERY_PARAM}=${encodeURIComponent(ref)}`;
  return url;
}
