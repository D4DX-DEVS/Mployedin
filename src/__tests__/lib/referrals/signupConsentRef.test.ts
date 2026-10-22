/**
 * @jest-environment jsdom
 */
import {
  SIGNUP_CONSENT_COOKIE,
  encodeSignupConsent,
  parseSignupConsent,
  rememberSignupConsent,
} from "@/lib/auth/signupConsent";

const CODE = "MPL-1A2B3C4D5E6F7A8B";

function clearCookie() {
  document.cookie = `${SIGNUP_CONSENT_COOKIE}=; Max-Age=0; Path=/`;
}

beforeEach(clearCookie);
afterEach(clearCookie);

describe("mpl_signup_consent carries the referral code", () => {
  it("round-trips a code with and without a cookie-banner answer", () => {
    expect(parseSignupConsent(encodeSignupConsent("accepted", CODE))).toEqual({
      terms: true,
      cookieChoice: "accepted",
      ref: CODE,
    });
    expect(parseSignupConsent(encodeSignupConsent(null, CODE))).toEqual({
      terms: true,
      cookieChoice: null,
      ref: CODE,
    });
  });

  it("keeps the old values unchanged when there is no code", () => {
    expect(encodeSignupConsent("accepted")).toBe("terms.accepted");
    expect(encodeSignupConsent(null)).toBe("terms");
    expect(parseSignupConsent("terms.declined")).toEqual({ terms: true, cookieChoice: "declined" });
    expect(parseSignupConsent("terms")).toEqual({ terms: true, cookieChoice: null });
  });

  it("does not encode a malformed code", () => {
    expect(encodeSignupConsent("accepted", "<script>")).toBe("terms.accepted");
    expect(encodeSignupConsent(null, "")).toBe("terms");
  });

  it("drops a malformed code when reading, but keeps the consent", () => {
    expect(parseSignupConsent("terms.accepted~%3Cscript%3E")).toEqual({ terms: true, cookieChoice: "accepted" });
    expect(parseSignupConsent("terms~nope")).toEqual({ terms: true, cookieChoice: null });
  });

  it("gives no code without the Terms tick", () => {
    expect(parseSignupConsent(`nope~${CODE}`)).toEqual({ terms: false, cookieChoice: null });
    expect(parseSignupConsent(undefined).ref).toBeUndefined();
  });

  it("reads a lower-case code as upper case", () => {
    expect(parseSignupConsent(`terms~${CODE.toLowerCase()}`).ref).toBe(CODE);
  });

  it("is written to the cookie on the click, not before", () => {
    expect(document.cookie).not.toContain(SIGNUP_CONSENT_COOKIE);
    rememberSignupConsent(CODE);
    expect(document.cookie).toContain(`${SIGNUP_CONSENT_COOKIE}=terms~${CODE}`);
  });

  it("is written without a code when there is none", () => {
    rememberSignupConsent();
    expect(document.cookie).toContain(`${SIGNUP_CONSENT_COOKIE}=terms`);
    expect(document.cookie).not.toContain("MPL-");
  });
});
