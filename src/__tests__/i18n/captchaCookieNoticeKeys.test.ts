/**
 * @jest-environment node
 *
 * Copy for the captcha notice, the contact form's captcha errors and the
 * cookies-disabled notice (PECR plan task 11). A missing key crashes the page in
 * next-intl, so every key exists in both locales, in a namespace the route group
 * already ships to the browser.
 */
import en from "../../../messages/en.json";
import ar from "../../../messages/ar.json";
import fs from "fs";
import path from "path";
import { CLIENT_NAMESPACES } from "@/lib/i18n/clientMessages";

type Messages = Record<string, Record<string, unknown>>;

const KEYS: Array<[namespace: string, key: string]> = [
  ["common", "captchaNotice"],
  ["common", "captchaPrivacyLink"],
  ["common", "captchaTermsLink"],
  ["landing", "contactCaptchaBlocked"],
  ["landing", "contactCaptchaUnavailable"],
  ["landing", "contactSendFailed"],
  ["auth", "cookiesDisabledNotice"],
];

const get = (messages: unknown, ns: string, key: string): unknown => (messages as Messages)[ns]?.[key];

describe("captcha and cookies-disabled copy", () => {
  it("uses the agreed English wording", () => {
    // [LEGAL] captchaNotice: the notice wording is the owner's/solicitor's call (decision D2).
    expect(get(en, "common", "captchaNotice")).toBe("Protected by reCAPTCHA. Google's {privacy} and {terms} apply.");
    expect(get(en, "common", "captchaPrivacyLink")).toBe("Privacy Policy");
    expect(get(en, "common", "captchaTermsLink")).toBe("Terms");
    expect(get(en, "landing", "contactCaptchaBlocked")).toBe(
      "We couldn't check you're not a bot. Check your connection or turn off blockers for this site, then try again.",
    );
    expect(get(en, "landing", "contactCaptchaUnavailable")).toBe("The bot check is temporarily unavailable. Please try again in a moment.");
    expect(get(en, "landing", "contactSendFailed")).toBe("We couldn't send your message. Please try again.");
    expect(get(en, "auth", "cookiesDisabledNotice")).toBe(
      "Cookies are turned off in your browser. Signing in needs them: turn them on for this site, then reload this page.",
    );
  });

  describe.each([
    ["en", en],
    ["ar", ar],
  ] as const)("%s", (locale, messages) => {
    it.each(KEYS)("has %s.%s as a non-empty string", (ns, key) => {
      const value = get(messages, ns, key);
      expect(typeof value === "string" && value.trim() !== "").toBe(true);
      if (locale === "ar") expect(value).not.toBe(get(en, ns, key));
    });

    it("keeps the {privacy} and {terms} slots in the notice, so the links can sit in the right place", () => {
      const notice = String(get(messages, "common", "captchaNotice"));
      expect(notice).toContain("{privacy}");
      expect(notice).toContain("{terms}");
      expect(notice).toContain("reCAPTCHA");
    });

    it("never says 'Failed to' and carries no [LEGAL] marker on screen", () => {
      for (const [ns, key] of KEYS) expect(String(get(messages, ns, key))).not.toMatch(/\[LEGAL\]|^Failed to/);
    });
  });

  it("states errors as 'couldn't …' (repo error-copy rule)", () => {
    expect(String(get(en, "landing", "contactCaptchaBlocked"))).toMatch(/^We couldn't /);
  });

  it("lives in namespaces that the public and auth groups already ship to the browser", () => {
    // CaptchaNotice (common) is used on the job page and contact form; the contact
    // strings (landing) on the contact form; the cookies notice (auth) on login and register.
    for (const ns of ["common", "landing", "auth"]) expect(CLIENT_NAMESPACES.public as readonly string[]).toContain(ns);
    for (const ns of ["common", "auth"]) expect(CLIENT_NAMESPACES.auth as readonly string[]).toContain(ns);
  });

  it("says 'bot check' (not 'robot') in English, as quick-apply does", () => {
    for (const key of ["contactCaptchaBlocked", "contactCaptchaUnavailable"]) expect(String(get(en, "landing", key))).not.toMatch(/robot/i);
  });
});

/**
 * The Cookie settings purpose line for reCAPTCHA is what a visitor is told the
 * captcha is for. It once said "only when you ask for an apply code" and went
 * stale when the contact form started using the captcha too.
 * [LEGAL] the wording of the purpose line.
 */
describe("consent purpose line for reCAPTCHA", () => {
  const purpose = (messages: unknown) => String(((messages as { consent: { items: Record<string, unknown> } }).consent.items).recaptcha);
  const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

  it("uses the agreed English wording", () => {
    expect(purpose(en)).toBe(
      "Spam protection by Google reCAPTCHA, only when you send a protected form (asking for an apply code, or the contact form)",
    );
  });

  it("names the contact form in both languages and no longer limits itself to the apply code", () => {
    expect(purpose(en)).toMatch(/contact form/i);
    expect(purpose(en)).not.toMatch(/only when you ask for an apply code/i);
    expect(purpose(ar)).toContain("نموذج التواصل");
  });

  it("is checked against the code: every place that asks for a captcha token is named by the line", () => {
    // Each protected form calls getCaptchaToken(action); the line must mention each one.
    const callers: Array<[file: string, mention: RegExp]> = [
      ["src/components/features/public/EasyApply.tsx", /apply code/i],
      ["src/app/[locale]/(public)/contact/page.tsx", /contact form/i],
    ];
    for (const [file, mention] of callers) {
      expect(read(file)).toMatch(/getCaptchaToken\(/);
      expect(purpose(en)).toMatch(mention);
    }
    // And no third caller appeared without the line (and this test) being revisited.
    const dir = path.join(process.cwd(), "src");
    const users: string[] = [];
    (function walk(d: string) {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.name === "__tests__" || e.name === "__mocks__") continue;
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(e.name) && /getCaptchaToken\(/.test(fs.readFileSync(p, "utf8"))) users.push(path.relative(dir, p).split(path.sep).join("/"));
      }
    })(dir);
    expect(users.filter((u) => u !== "lib/browser/captcha.ts").sort()).toEqual([
      "app/[locale]/(public)/contact/page.tsx",
      "components/features/public/EasyApply.tsx",
    ]);
  });
});
