/**
 * @jest-environment jsdom
 *
 * The root error boundary and the offline page sit outside the [locale]
 * layouts. They pick the language from the URL the visitor is on first
 * (/ar/... or /en/...), and only then from NEXT_LOCALE - which is a preference
 * cookie, so only while preferences are allowed - and the browser's language.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CONSENT_COOKIE, serializeConsent } from "@/lib/consent/state";

jest.mock("next/font/google", () => ({ Manrope: () => ({ style: { fontFamily: "Manrope" } }) }));
jest.mock("@/lib/observability/report-error", () => ({ reportError: jest.fn() }));

import GlobalError from "@/app/global-error";
import OfflinePage from "@/app/~offline/page";

function visit(pathname: string) {
  window.history.pushState({}, "", pathname);
}
function setCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/`;
}
function consent(preferences: boolean): string {
  return serializeConsent({ v: 1, id: "x", preferences, media: false, at: "2026-10-20T00:00:00.000Z" });
}
function browserLanguage(language: string) {
  jest.spyOn(window.navigator, "language", "get").mockReturnValue(language);
}

beforeEach(() => {
  for (const name of ["NEXT_LOCALE", CONSENT_COOKIE]) document.cookie = `${name}=; Max-Age=0; path=/`;
  visit("/");
  browserLanguage("en-GB");
});
afterEach(() => jest.restoreAllMocks());

const globalError = () => renderToStaticMarkup(<GlobalError error={new Error("boom")} reset={() => {}} />);
const offline = () => renderToStaticMarkup(<OfflinePage />);

describe("global-error picks the language", () => {
  it("Arabic from an /ar URL, with right-to-left and Arabic links", () => {
    visit("/ar/employer/jobs");
    const html = globalError();
    expect(html).toContain('lang="ar"');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("حدث خطأ ما");
    expect(html).toContain('href="/ar"');
    expect(html).toContain('href="/ar/contact"');
  });

  it("English from an /en URL, even when NEXT_LOCALE and the browser say Arabic", () => {
    setCookie("NEXT_LOCALE", "ar");
    browserLanguage("ar-EG");
    visit("/en/employer/jobs");
    const html = globalError();
    expect(html).toContain('lang="en"');
    expect(html).toContain('dir="ltr"');
    expect(html).toContain("Something went wrong");
    expect(html).toContain('href="/en"');
  });

  it("Arabic from an /ar URL when preferences were refused (the URL is not a preference)", () => {
    setCookie(CONSENT_COOKIE, consent(false));
    visit("/ar");
    expect(globalError()).toContain("حدث خطأ ما");
  });

  it("falls back to NEXT_LOCALE when the URL has no language", () => {
    setCookie("NEXT_LOCALE", "ar");
    expect(globalError()).toContain("حدث خطأ ما");
  });

  it("does not fall back to NEXT_LOCALE once preferences were refused", () => {
    setCookie("NEXT_LOCALE", "ar");
    setCookie(CONSENT_COOKIE, consent(false));
    expect(globalError()).toContain("Something went wrong");
  });

  it("falls back to the browser's language, then English", () => {
    browserLanguage("ar-EG");
    expect(globalError()).toContain("حدث خطأ ما");
    browserLanguage("en-US");
    expect(globalError()).toContain("Something went wrong");
  });
});

describe("the offline page picks the language", () => {
  it("Arabic from an /ar URL (the service worker serves this page at the URL that was asked for)", () => {
    visit("/ar/job-seeker/jobs");
    const html = offline();
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("أنت غير متصل");
  });

  it("English from an /en URL, even when NEXT_LOCALE and the browser say Arabic", () => {
    setCookie("NEXT_LOCALE", "ar");
    browserLanguage("ar");
    visit("/en/jobs");
    const html = offline();
    expect(html).toContain('dir="ltr"');
    expect(html).toContain("Offline");
    expect(html).not.toContain("أنت غير متصل");
  });

  it("falls back to NEXT_LOCALE while preferences are allowed, and ignores it once refused", () => {
    setCookie("NEXT_LOCALE", "ar");
    expect(offline()).toContain("أنت غير متصل");

    setCookie(CONSENT_COOKIE, consent(false));
    expect(offline()).toContain("Offline");
    expect(offline()).not.toContain("أنت غير متصل");
  });

  it("falls back to the browser's language, then English", () => {
    browserLanguage("ar-SA");
    expect(offline()).toContain("أنت غير متصل");
    browserLanguage("en-GB");
    expect(offline()).toContain("Offline");
  });
});
