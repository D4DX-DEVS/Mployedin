/**
 * @jest-environment jsdom
 *
 * Work in progress and one-off dismissals that must not outlive the tab: they
 * go to sessionStorage whatever the visitor chose about cookies, never to
 * localStorage, and storage that is blocked never breaks the page.
 */
import { tabStorage } from "@/lib/consent/tabStorage";
import { writeConsent } from "@/lib/consent/client";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  document.cookie = "mpl_consent=; Max-Age=0; path=/";
});
afterEach(() => jest.restoreAllMocks());

describe("tabStorage", () => {
  it("round-trips a value in sessionStorage and leaves localStorage empty", () => {
    tabStorage.set("k", "v");

    expect(tabStorage.get("k")).toBe("v");
    expect(sessionStorage.getItem("k")).toBe("v");
    expect(localStorage.length).toBe(0);
  });

  it("does not change with the visitor's choice about preferences", () => {
    writeConsent({ preferences: true, media: false });
    tabStorage.set("a", "1");
    writeConsent({ preferences: false, media: false });
    tabStorage.set("b", "2");

    expect(sessionStorage.getItem("a")).toBe("1");
    expect(sessionStorage.getItem("b")).toBe("2");
    expect(localStorage.length).toBe(0);
  });

  it("does not read localStorage", () => {
    localStorage.setItem("k", "old");

    expect(tabStorage.get("k")).toBeNull();
  });

  it("offers only what the app uses: get and set (sign-out clears tab keys by prefix in logoutCleanup)", () => {
    expect(Object.keys(tabStorage).sort()).toEqual(["get", "set"]);
  });

  it("never throws when storage is blocked", () => {
    jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(tabStorage.get("k")).toBeNull();
    expect(() => tabStorage.set("k", "v")).not.toThrow();
  });
});
