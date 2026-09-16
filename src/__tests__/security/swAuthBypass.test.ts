import { getSecurityHeaders, SECURITY_HEADERS } from "@/lib/security/headers";
import { isAuthRequest } from "@/lib/security/swAuthBypass";

/**
 * Google sign-in broke in production while working in a fresh browser profile.
 * Cause: `@serwist/next`'s `defaultCache` ends with a catch-all `cross-origin`
 * NetworkFirst that caches every cross-origin GET for an hour, Firebase's popup
 * handshake is made entirely of such GETs, and a replayed handler never returns
 * the credential to its opener. These tests hold both halves of the fix.
 */
describe("service worker auth bypass", () => {
  it.each([
    "https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=k",
    "https://securetoken.googleapis.com/v1/token?key=k",
    "https://accounts.google.com/o/oauth2/auth",
    "https://apis.google.com/js/api.js",
    "https://mployedin-d3d2a.firebaseapp.com/__/auth/iframe",
    "https://mployedin-d3d2a.firebaseapp.com/__/auth/handler?providerId=google.com",
  ])("never caches %s", (href) => {
    expect(isAuthRequest(new URL(href))).toBe(true);
  });

  it.each([
    "https://mployedin-app-jr8h5.ondigitalocean.app/en/login",
    "https://res.cloudinary.com/demo/image/upload/a.png",
    "https://fonts.gstatic.com/s/inter/v13/a.woff2",
  ])("leaves %s on the normal caching rules", (href) => {
    expect(isAuthRequest(new URL(href))).toBe(false);
  });

  it("does not match a lookalike host that merely contains firebaseapp.com", () => {
    expect(isAuthRequest(new URL("https://firebaseapp.com.evil.test/__x"))).toBe(false);
  });
});

/**
 * signInWithPopup polls `popup.closed` and calls `popup.close()`. Without this
 * header the opener handle is severed the moment the popup reaches
 * accounts.google.com, so the SDK cannot tell a dismissed popup from a hung one.
 */
describe("Cross-Origin-Opener-Policy", () => {
  it("allows popups we open, on page responses", () => {
    expect(getSecurityHeaders("test-nonce")["Cross-Origin-Opener-Policy"]).toBe(
      "same-origin-allow-popups",
    );
  });

  it("allows popups we open, on API responses", () => {
    expect(SECURITY_HEADERS["Cross-Origin-Opener-Policy"]).toBe("same-origin-allow-popups");
  });
});
