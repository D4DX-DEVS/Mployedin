import { isInAppBrowser, inAppBrowserName } from "@/lib/browser/inAppBrowser";

describe("inAppBrowser", () => {
  describe("isInAppBrowser", () => {
    it("detects Instagram", () => {
      const ua = "Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 (KHTML, like Gecko) Instagram";
      expect(isInAppBrowser(ua)).toBe(true);
    });

    it("detects FBAN (Facebook on Android)", () => {
      const ua = "Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0 Mobile FBAN/123";
      expect(isInAppBrowser(ua)).toBe(true);
    });

    it("detects FBAV (Facebook on iOS)", () => {
      const ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Mobile/15E148 FBAV/330.0";
      expect(isInAppBrowser(ua)).toBe(true);
    });

    it("detects FB_IAB (Facebook Instant Articles)", () => {
      const ua = "Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0 Mobile FB_IAB";
      expect(isInAppBrowser(ua)).toBe(true);
    });

    it("detects WhatsApp", () => {
      const ua = "Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0 Mobile Safari/537.36 WhatsApp";
      expect(isInAppBrowser(ua)).toBe(true);
    });

    it("detects Telegram", () => {
      const ua = "Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0 Mobile Safari/537.36 Telegram";
      expect(isInAppBrowser(ua)).toBe(true);
    });

    it("detects TikTok (BytedanceWebview)", () => {
      const ua = "Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0 Mobile Safari/537.36 BytedanceWebview";
      expect(isInAppBrowser(ua)).toBe(true);
    });

    it("detects TikTok (musical_ly)", () => {
      const ua = "Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0 Mobile Safari/537.36 musical_ly";
      expect(isInAppBrowser(ua)).toBe(true);
    });

    it("detects WeChat (MicroMessenger)", () => {
      const ua = "Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0 Mobile Safari/537.36 MicroMessenger";
      expect(isInAppBrowser(ua)).toBe(true);
    });

    it("detects Android generic webview (; wv)", () => {
      const ua = "Mozilla/5.0 (Linux; Android 11; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36; wv)";
      expect(isInAppBrowser(ua)).toBe(true);
    });

    it("returns false for desktop Chrome", () => {
      const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36";
      expect(isInAppBrowser(ua)).toBe(false);
    });

    it("returns false for macOS Safari", () => {
      const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15";
      expect(isInAppBrowser(ua)).toBe(false);
    });

    it("returns false for iOS Safari", () => {
      const ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Mobile/15E148 Safari/604.1";
      expect(isInAppBrowser(ua)).toBe(false);
    });

    it("returns false for Firefox", () => {
      const ua = "Mozilla/5.0 (X11; Linux x86_64; rv:89.0) Gecko/20100101 Firefox/89.0";
      expect(isInAppBrowser(ua)).toBe(false);
    });

    it("returns false for Edge", () => {
      const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36 Edg/91.0.864.59";
      expect(isInAppBrowser(ua)).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(isInAppBrowser(undefined)).toBe(false);
    });

    it("returns false for null", () => {
      expect(isInAppBrowser(null)).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isInAppBrowser("")).toBe(false);
    });
  });

  describe("inAppBrowserName", () => {
    it("returns 'Instagram' for Instagram user agent", () => {
      const ua = "Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 (KHTML, like Gecko) Instagram";
      expect(inAppBrowserName(ua)).toBe("Instagram");
    });

    it("returns 'Facebook' for FBAN", () => {
      const ua = "Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0 Mobile FBAN/123";
      expect(inAppBrowserName(ua)).toBe("Facebook");
    });

    it("returns 'WhatsApp' for WhatsApp user agent", () => {
      const ua = "Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0 Mobile Safari/537.36 WhatsApp";
      expect(inAppBrowserName(ua)).toBe("WhatsApp");
    });

    it("returns 'Telegram' for Telegram user agent", () => {
      const ua = "Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0 Mobile Safari/537.36 Telegram";
      expect(inAppBrowserName(ua)).toBe("Telegram");
    });

    it("returns 'TikTok' for TikTok user agent", () => {
      const ua = "Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0 Mobile Safari/537.36 BytedanceWebview";
      expect(inAppBrowserName(ua)).toBe("TikTok");
    });

    it("returns 'WeChat' for WeChat user agent", () => {
      const ua = "Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0 Mobile Safari/537.36 MicroMessenger";
      expect(inAppBrowserName(ua)).toBe("WeChat");
    });

    it("returns null for desktop Chrome", () => {
      const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36";
      expect(inAppBrowserName(ua)).toBeNull();
    });

    it("returns null for undefined", () => {
      expect(inAppBrowserName(undefined)).toBeNull();
    });

    it("returns null for null", () => {
      expect(inAppBrowserName(null)).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(inAppBrowserName("")).toBeNull();
    });
  });
});
