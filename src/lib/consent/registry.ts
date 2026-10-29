import type { ConsentCategory } from "./state";

export type RegistryItem = {
  name: string; // exact name, or prefix ending in "*"
  kind: "cookie" | "localStorage" | "sessionStorage" | "indexedDB" | "cacheStorage" | "serviceWorker" | "thirdPartyHost";
  category: ConsentCategory;
  basis: "strictly-necessary" | "appearance" | "consent" | "user-action";
  party: "first" | "third";
  duration: string;
  owner: string; // team/file responsible
  purposeKey: string; // messages: consent.items.<purposeKey>
  legal?: "pending" | "approved"; // [LEGAL] review status
};

// Single source for banner, cookie policy, inventory guard and E2E.
// Add a row BEFORE adding any cookie, storage key, IndexedDB db or third-party host.
export const REGISTRY: RegistryItem[] = [
  // strictly necessary
  { name: "authjs.*", kind: "cookie", category: "necessary", basis: "strictly-necessary", party: "first", duration: "session / up to 3 days", owner: "auth", purposeKey: "auth" },
  { name: "__Secure-authjs.*", kind: "cookie", category: "necessary", basis: "strictly-necessary", party: "first", duration: "session / up to 3 days", owner: "auth", purposeKey: "auth" },
  { name: "__Host-authjs.*", kind: "cookie", category: "necessary", basis: "strictly-necessary", party: "first", duration: "session", owner: "auth", purposeKey: "auth" },
  { name: "csrf-token", kind: "cookie", category: "necessary", basis: "strictly-necessary", party: "first", duration: "2 hours", owner: "security", purposeKey: "csrf" },
  { name: "mployedin_tenant_view", kind: "cookie", category: "necessary", basis: "strictly-necessary", party: "first", duration: "session", owner: "security", purposeKey: "tenantView" },
  { name: "mpl_signup_consent", kind: "cookie", category: "necessary", basis: "strictly-necessary", party: "first", duration: "30 minutes", owner: "auth", purposeKey: "signupConsent" },
  { name: "mpl_consent", kind: "cookie", category: "necessary", basis: "strictly-necessary", party: "first", duration: "6 months", owner: "consent", purposeKey: "consentChoice" },
  // From the moment a choice is made until its receipt has been stored (or the tab closes): the reference, locale, source, a counter and the time of the next try, so a receipt that failed or was interrupted can be sent again on a later page load or when the browser is back online (lib/consent/pendingReceipt).
  { name: "mpl_receipt_pending", kind: "sessionStorage", category: "necessary", basis: "strictly-necessary", party: "first", duration: "tab", owner: "consent", purposeKey: "consentChoice" },
  { name: "mployedin_last_activity", kind: "localStorage", category: "necessary", basis: "strictly-necessary", party: "first", duration: "until sign-out", owner: "auth", purposeKey: "idle" },
  { name: "mployedin_remember_email", kind: "localStorage", category: "necessary", basis: "user-action", party: "first", duration: "until removed", owner: "auth", purposeKey: "rememberEmail" },
  { name: "job-ai-*", kind: "sessionStorage", category: "necessary", basis: "user-action", party: "first", duration: "tab", owner: "employer", purposeKey: "taskState" },
  { name: "job-draft-*", kind: "sessionStorage", category: "necessary", basis: "user-action", party: "first", duration: "tab", owner: "employer", purposeKey: "jobDraft" },
  { name: "job-prefs-draft", kind: "sessionStorage", category: "necessary", basis: "user-action", party: "first", duration: "tab", owner: "seeker", purposeKey: "taskState" },
  { name: "employer-candidate-matching-session-v1", kind: "sessionStorage", category: "necessary", basis: "user-action", party: "first", duration: "tab", owner: "employer", purposeKey: "taskState" },
  { name: "ai-thread-*", kind: "sessionStorage", category: "necessary", basis: "user-action", party: "first", duration: "tab", owner: "ai", purposeKey: "taskState" },
  { name: "ai_insights_*", kind: "sessionStorage", category: "necessary", basis: "user-action", party: "first", duration: "tab", owner: "ai", purposeKey: "taskState" },
  { name: "copilot-chats", kind: "sessionStorage", category: "necessary", basis: "user-action", party: "first", duration: "tab", owner: "ai", purposeKey: "taskState" },
  { name: "poster-edit:*", kind: "sessionStorage", category: "necessary", basis: "user-action", party: "first", duration: "tab", owner: "employer", purposeKey: "taskState" },
  { name: "mployedin:temp-password-notice-dismissed:*", kind: "sessionStorage", category: "necessary", basis: "user-action", party: "first", duration: "tab", owner: "auth", purposeKey: "noticeDismissed" },
  // user-action third parties (load only after a click)
  { name: "firebaseLocalStorageDb", kind: "indexedDB", category: "necessary", basis: "user-action", party: "third", duration: "none (held in memory only)", owner: "auth", purposeKey: "firebase", legal: "pending" },
  { name: "firebase-heartbeat-database", kind: "indexedDB", category: "necessary", basis: "user-action", party: "third", duration: "deleted on the next full page load", owner: "auth", purposeKey: "firebase", legal: "pending" },
  { name: "apis.google.com", kind: "thirdPartyHost", category: "necessary", basis: "user-action", party: "third", duration: "per Google", owner: "auth", purposeKey: "firebase" },
  { name: "*.firebaseapp.com", kind: "thirdPartyHost", category: "necessary", basis: "user-action", party: "third", duration: "per Google", owner: "auth", purposeKey: "firebase" },
  { name: "identitytoolkit.googleapis.com", kind: "thirdPartyHost", category: "necessary", basis: "user-action", party: "third", duration: "per Google", owner: "auth", purposeKey: "firebase" },
  { name: "securetoken.googleapis.com", kind: "thirdPartyHost", category: "necessary", basis: "user-action", party: "third", duration: "per Google", owner: "auth", purposeKey: "firebase" },
  // The Google sign-in window Firebase opens on the click.
  { name: "accounts.google.com", kind: "thirdPartyHost", category: "necessary", basis: "user-action", party: "third", duration: "per Google", owner: "auth", purposeKey: "firebase" },
  { name: "www.google.com/recaptcha", kind: "thirdPartyHost", category: "necessary", basis: "user-action", party: "third", duration: "per Google", owner: "security", purposeKey: "recaptcha", legal: "pending" },
  // The second frame host Google's reCAPTCHA CSP guidance lists (frame-src, /recaptcha/ only).
  { name: "recaptcha.google.com/recaptcha", kind: "thirdPartyHost", category: "necessary", basis: "user-action", party: "third", duration: "per Google", owner: "security", purposeKey: "recaptcha", legal: "pending" },
  // reCAPTCHA's api.js loads the rest of the widget from here.
  { name: "www.gstatic.com/recaptcha", kind: "thirdPartyHost", category: "necessary", basis: "user-action", party: "third", duration: "per Google", owner: "security", purposeKey: "recaptcha", legal: "pending" },
  // The reCAPTCHA frame loads its own font from here (seen in the 2026-10-28 live test); our CSP doesn't govern Google's frame.
  { name: "fonts.gstatic.com", kind: "thirdPartyHost", category: "necessary", basis: "user-action", party: "third", duration: "per Google", owner: "security", purposeKey: "recaptcha", legal: "pending" },
  { name: "_grecaptcha", kind: "localStorage", category: "necessary", basis: "user-action", party: "third", duration: "per Google", owner: "security", purposeKey: "recaptcha", legal: "pending" },
  { name: "mployedin-sw", kind: "serviceWorker", category: "necessary", basis: "user-action", party: "first", duration: "until uninstalled", owner: "pwa", purposeKey: "offline" },
  { name: "mployedin_sw_opt_in", kind: "localStorage", category: "necessary", basis: "user-action", party: "first", duration: "until notifications/app removed", owner: "pwa", purposeKey: "offline" },
  { name: "serwist-*", kind: "cacheStorage", category: "necessary", basis: "user-action", party: "first", duration: "up to 30 days, static assets only", owner: "pwa", purposeKey: "offline" },
  { name: "serwist-expiration", kind: "indexedDB", category: "necessary", basis: "user-action", party: "first", duration: "with SW", owner: "pwa", purposeKey: "offline" },
  // first-party hosts the browser contacts (no cookies)
  { name: "*.digitaloceanspaces.com", kind: "thirdPartyHost", category: "necessary", basis: "strictly-necessary", party: "first", duration: "n/a", owner: "storage", purposeKey: "files" },
  // Cloudflare R2 (STORAGE_PROVIDER=r2): the public bucket's r2.dev address and the API host private files are presigned on.
  { name: "*.r2.dev", kind: "thirdPartyHost", category: "necessary", basis: "strictly-necessary", party: "first", duration: "n/a", owner: "storage", purposeKey: "files" },
  { name: "*.r2.cloudflarestorage.com", kind: "thirdPartyHost", category: "necessary", basis: "strictly-necessary", party: "first", duration: "n/a", owner: "storage", purposeKey: "files" },
  // Cloudinary: still in the CSP img-src and images.remotePatterns, but no public page loads it (lib/images/externalAvatar
  // refuses it: the host is shared by every Cloudinary account, and Spaces replaced it). Kept until the owner has checked
  // whether any stored image URL still points here; then remove this row, the CSP entry and the remotePattern together.
  { name: "res.cloudinary.com", kind: "thirdPartyHost", category: "necessary", basis: "strictly-necessary", party: "third", duration: "n/a", owner: "storage", purposeKey: "files" },
  // preferences (appearance, owner decision D1)
  { name: "NEXT_LOCALE", kind: "cookie", category: "preferences", basis: "appearance", party: "first", duration: "12 months", owner: "i18n", purposeKey: "locale" },
  { name: "mployedin_a11y", kind: "cookie", category: "preferences", basis: "appearance", party: "first", duration: "12 months (session if not allowed)", owner: "a11y", purposeKey: "a11y" },
  // Kept on the device while preferences are allowed; for the tab only (sessionStorage) once the visitor objects (prefStorage).
  { name: "mployedin_display_currency", kind: "localStorage", category: "preferences", basis: "appearance", party: "first", duration: "until removed (this visit only if you object)", owner: "billing", purposeKey: "currency" },
  { name: "ui:*", kind: "localStorage", category: "preferences", basis: "appearance", party: "first", duration: "until removed (this visit only if you object)", owner: "ui", purposeKey: "uiState" },
  // media
  { name: "www.youtube-nocookie.com", kind: "thirdPartyHost", category: "media", basis: "consent", party: "third", duration: "per Google", owner: "cms", purposeKey: "youtube" },
];
