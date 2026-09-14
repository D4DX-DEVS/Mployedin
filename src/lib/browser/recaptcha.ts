/**
 * Client-side reCAPTCHA v3 token acquisition.
 *
 * Invisible to the visitor: no checkbox, no puzzle. The script is loaded lazily
 * on first use, and only when NEXT_PUBLIC_RECAPTCHA_SITE_KEY is set, so
 * environments without keys pay nothing and send no token — the server treats
 * a missing key as "check disabled" (see src/lib/security/recaptcha.ts).
 */

const SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

interface Grecaptcha {
  ready: (cb: () => void) => void;
  execute: (siteKey: string, opts: { action: string }) => Promise<string>;
}

declare global {
  interface Window {
    grecaptcha?: Grecaptcha;
  }
}

let scriptPromise: Promise<void> | null = null;

export function isRecaptchaEnabled(): boolean {
  return Boolean(SITE_KEY);
}

function loadScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("no document"));
      return;
    }
    if (window.grecaptcha) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(SITE_KEY ?? "")}`;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error("recaptcha script failed to load"));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

/**
 * Returns a token for `action`, or null when reCAPTCHA is not enabled or could
 * not be reached. Callers send the token when present; the server decides
 * whether its absence is acceptable.
 */
export async function getRecaptchaToken(action: string): Promise<string | null> {
  if (!SITE_KEY || typeof window === "undefined") return null;
  try {
    await loadScript();
    const g = window.grecaptcha;
    if (!g) return null;
    await new Promise<void>((resolve) => g.ready(resolve));
    return await g.execute(SITE_KEY, { action });
  } catch {
    return null;
  }
}
