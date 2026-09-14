/**
 * Detect if the user agent is from an embedded webview (in-app browser)
 * that shared job links commonly arrive in.
 */

// List of regex patterns to detect in-app browsers
const IN_APP_BROWSER_PATTERNS = [
  // Facebook
  { pattern: /FBAN|FBAV|FB_IAB/, name: "Facebook" },
  // Instagram
  { pattern: /Instagram/, name: "Instagram" },
  // Messenger
  { pattern: /\bMessenger\b/, name: "Messenger" },
  // WhatsApp
  { pattern: /WhatsApp/, name: "WhatsApp" },
  // Telegram
  { pattern: /Telegram/, name: "Telegram" },
  // LinkedIn
  { pattern: /LinkedInApp/, name: "LinkedIn" },
  // Twitter
  { pattern: /Twitter/, name: "Twitter" },
  // Snapchat
  { pattern: /Snapchat/, name: "Snapchat" },
  // Line
  { pattern: /Line\//, name: "Line" },
  // WeChat
  { pattern: /MicroMessenger/, name: "WeChat" },
  // TikTok
  { pattern: /BytedanceWebview|musical_ly/, name: "TikTok" },
  // Pinterest
  { pattern: /Pinterest/, name: "Pinterest" },
  // Android generic webview
  { pattern: /; wv\)/, name: "Android Webview" },
];

/**
 * Check if the user agent string indicates an in-app browser.
 * Safe to call with undefined (defaults to navigator.userAgent when available).
 */
export function isInAppBrowser(ua?: string | null): boolean {
  const userAgent = ua ?? (typeof navigator !== "undefined" ? navigator.userAgent : "");

  if (!userAgent) {
    return false;
  }

  return IN_APP_BROWSER_PATTERNS.some((pattern) => pattern.pattern.test(userAgent));
}

/**
 * Get the name of the detected in-app browser, or null if not detected.
 */
export function inAppBrowserName(ua?: string | null): string | null {
  const userAgent = ua ?? (typeof navigator !== "undefined" ? navigator.userAgent : "");

  if (!userAgent) {
    return null;
  }

  for (const { pattern, name } of IN_APP_BROWSER_PATTERNS) {
    if (pattern.test(userAgent)) {
      return name;
    }
  }

  return null;
}

// Export for testing
export { IN_APP_BROWSER_PATTERNS };
