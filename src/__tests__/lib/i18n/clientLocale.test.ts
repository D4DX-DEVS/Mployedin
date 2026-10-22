/**
 * @jest-environment jsdom
 *
 * The root error page and the offline page render outside the locale layouts,
 * so they work the language out themselves. The URL the visitor is on comes
 * first (it is always there), then NEXT_LOCALE - a preference cookie, read only
 * while preferences are allowed - then the browser's language.
 */
import { resolveClientLocale } from "@/lib/i18n/clientLocale";
import { CONSENT_COOKIE, serializeConsent } from "@/lib/consent/state";

function visit(pathname: string) {
  window.history.pushState({}, "", pathname);
}
function setCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/`;
}
function clearCookies() {
  for (const name of ["NEXT_LOCALE", CONSENT_COOKIE]) document.cookie = `${name}=; Max-Age=0; path=/`;
}
function consent(preferences: boolean): string {
  return serializeConsent({ v: 1, id: "x", preferences, media: false, at: "2026-10-20T00:00:00.000Z" });
}
function browserLanguage(language: string) {
  jest.spyOn(window.navigator, "language", "get").mockReturnValue(language);
}

beforeEach(() => {
  clearCookies();
  visit("/");
  browserLanguage("en-GB");
});
afterEach(() => jest.restoreAllMocks());

describe("resolveClientLocale: the URL first", () => {
  it.each([
    ["/ar", "ar"],
    ["/ar/jobs?x=1", "ar"],
    ["/ar/job-seeker/dashboard", "ar"],
    ["/en", "en"],
    ["/en/employer/jobs", "en"],
  ])("%s -> %s", (pathname, expected) => {
    visit(pathname);
    expect(resolveClientLocale()).toBe(expected);
  });

  it("takes the page's language over NEXT_LOCALE and over the browser's", () => {
    setCookie("NEXT_LOCALE", "ar");
    browserLanguage("ar-EG");
    visit("/en/jobs");
    expect(resolveClientLocale()).toBe("en");

    setCookie("NEXT_LOCALE", "en");
    browserLanguage("en-GB");
    visit("/ar/jobs");
    expect(resolveClientLocale()).toBe("ar");
  });

  it("takes the page's language when preferences were refused, since the URL is not a preference", () => {
    setCookie(CONSENT_COOKIE, consent(false));
    visit("/ar/jobs");
    expect(resolveClientLocale()).toBe("ar");
  });

  it("does not take /arabic or /archive for a locale path", () => {
    visit("/arabic");
    expect(resolveClientLocale()).toBe("en");
    visit("/archive/ar");
    expect(resolveClientLocale()).toBe("en");
  });
});

describe("resolveClientLocale: NEXT_LOCALE when the URL has no language", () => {
  it("uses NEXT_LOCALE=ar when no choice was made yet", () => {
    setCookie("NEXT_LOCALE", "ar");
    visit("/~offline");
    expect(resolveClientLocale()).toBe("ar");
  });

  it("uses NEXT_LOCALE=ar when preferences were accepted", () => {
    setCookie("NEXT_LOCALE", "ar");
    setCookie(CONSENT_COOKIE, consent(true));
    expect(resolveClientLocale()).toBe("ar");
  });

  it("ignores NEXT_LOCALE=ar once preferences were refused", () => {
    setCookie("NEXT_LOCALE", "ar");
    setCookie(CONSENT_COOKIE, consent(false));
    expect(resolveClientLocale()).toBe("en");
  });

  it.each(["fr", "AR", "ar,en", "../ar"])("ignores the garbage cookie %j", (value) => {
    setCookie("NEXT_LOCALE", encodeURIComponent(value));
    expect(resolveClientLocale()).toBe("en");
  });
});

describe("resolveClientLocale: the default", () => {
  it("follows an Arabic browser when nothing else says", () => {
    browserLanguage("ar-EG");
    expect(resolveClientLocale()).toBe("ar");
  });

  it("follows an Arabic browser when preferences were refused (it is not a cookie)", () => {
    setCookie("NEXT_LOCALE", "en");
    setCookie(CONSENT_COOKIE, consent(false));
    browserLanguage("ar");
    expect(resolveClientLocale()).toBe("ar");
  });

  it("is English otherwise", () => {
    expect(resolveClientLocale()).toBe("en");
    browserLanguage("fr-FR");
    expect(resolveClientLocale()).toBe("en");
  });
});
