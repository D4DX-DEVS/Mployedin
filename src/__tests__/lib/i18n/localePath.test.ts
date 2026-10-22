/**
 * @jest-environment node
 *
 * The locale vocabulary shared by the server helpers (requestLocale.ts) and the
 * browser helper (clientLocale.ts). It has no imports, so the client bundles of
 * the error page and the offline page can take it without a server module.
 */
import fs from "fs";
import path from "path";
import { LOCALE_QUERY_PARAM, SUPPORTED_LOCALES, isSupportedLocale, localeFromPath } from "@/lib/i18n/localePath";

describe("isSupportedLocale", () => {
  it.each(["en", "ar"])("accepts %j", (value) => {
    expect(isSupportedLocale(value)).toBe(true);
  });

  it.each(["fr", "EN", "Ar", "", " ar", "ar ", "ar,en", "arabic", "en-GB", "../ar", null, undefined, 1, {}, ["ar"]])(
    "rejects %j",
    (value) => {
      expect(isSupportedLocale(value)).toBe(false);
    },
  );
});

describe("SUPPORTED_LOCALES", () => {
  it("is exactly the locales the router serves (it cannot drift from src/i18n/routing.ts)", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src", "i18n", "routing.ts"), "utf8");
    const declared = /locales:\s*\[([^\]]*)\]/.exec(source)?.[1].match(/"([^"]+)"/g)?.map((s) => s.slice(1, -1));
    expect([...SUPPORTED_LOCALES].sort()).toEqual([...(declared ?? [])].sort());
  });
});

describe("LOCALE_QUERY_PARAM", () => {
  it("is the name the login and register pages write and the callback reader reads", () => {
    expect(LOCALE_QUERY_PARAM).toBe("locale");
  });
});

describe("localeFromPath (shared by the server and browser helpers)", () => {
  it.each([
    ["/ar", "ar"],
    ["/ar/", "ar"],
    ["/ar/job-seeker/jobs?x=1", "ar"],
    ["/ar?x=1", "ar"],
    ["/ar#top", "ar"],
    ["/en/login", "en"],
  ])("%s -> %s", (pathname, expected) => {
    expect(localeFromPath(pathname)).toBe(expected);
  });

  it.each(["", "/", "/arabic", "/archive/ar", "/fr/login", "ar/login", "//ar/login", "/api/ar"])("%j is no locale path", (pathname) => {
    expect(localeFromPath(pathname)).toBeNull();
  });
});
