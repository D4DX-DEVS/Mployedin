/**
 * @jest-environment jsdom
 */
import {
  clearPendingReferral,
  getPendingReferral,
  replaceAddressBarSoon,
  setPendingReferral,
  stripRefFromAddressBar,
  stripRefFromAddressBarSoon,
  subscribePendingReferral,
} from "@/lib/referrals/pendingReferral";
import { registerHrefFor } from "@/lib/referrals/url";

const CODE = "MPL-1A2B3C4D5E6F7A8B";

afterEach(() => {
  clearPendingReferral();
  window.history.replaceState(null, "", "/");
  jest.restoreAllMocks();
});

describe("registerHrefFor", () => {
  it("is the plain register page without a code", () => {
    expect(registerHrefFor("en", "")).toBe("/en/register");
    expect(registerHrefFor("ar")).toBe("/ar/register");
  });

  it("carries a valid code as ?ref=", () => {
    expect(registerHrefFor("en", CODE)).toBe(`/en/register?ref=${CODE}`);
  });

  it("never puts a malformed code in the link", () => {
    expect(registerHrefFor("en", "<script>")).toBe("/en/register");
    expect(registerHrefFor("en", "MPL-1")).toBe("/en/register");
  });
});

describe("in-memory pending referral", () => {
  it("starts empty and holds a valid code until it is cleared", () => {
    expect(getPendingReferral()).toBe("");
    setPendingReferral(CODE);
    expect(getPendingReferral()).toBe(CODE);
    clearPendingReferral();
    expect(getPendingReferral()).toBe("");
  });

  it("normalises case and refuses a malformed code", () => {
    setPendingReferral(CODE.toLowerCase());
    expect(getPendingReferral()).toBe(CODE);
    setPendingReferral("<script>");
    expect(getPendingReferral()).toBe(CODE);
  });

  it("tells subscribers when the code changes, and stops after unsubscribe", () => {
    const seen = jest.fn();
    const off = subscribePendingReferral(seen);
    setPendingReferral(CODE);
    expect(seen).toHaveBeenCalledTimes(1);
    off();
    clearPendingReferral();
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("writes nothing to cookies or web storage", () => {
    setPendingReferral(CODE);
    expect(document.cookie).not.toContain("MPL-");
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});

describe("stripRefFromAddressBar", () => {
  it("drops ref and keeps the other params and the hash", () => {
    window.history.replaceState(null, "", `/en/register?callbackUrl=%2Fen%2Fjobs&ref=${CODE}&utm=a#form`);
    const spy = jest.spyOn(window.history, "replaceState");
    stripRefFromAddressBar();
    expect(spy).toHaveBeenCalledTimes(1);
    // Never window.history.state: Next's patched replaceState would skip its router sync.
    expect(spy.mock.calls[0][0]).toBeNull();
    expect(window.location.pathname + window.location.search + window.location.hash).toBe(
      "/en/register?callbackUrl=%2Fen%2Fjobs&utm=a#form",
    );
  });

  it("leaves a bare path when ref was the only param", () => {
    window.history.replaceState(null, "", `/en/jobs/abc?ref=${CODE}`);
    stripRefFromAddressBar();
    expect(window.location.pathname + window.location.search).toBe("/en/jobs/abc");
  });

  it("does nothing when the address has no ref", () => {
    window.history.replaceState(null, "", "/en/jobs/abc?x=1");
    const spy = jest.spyOn(window.history, "replaceState");
    stripRefFromAddressBar();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("stripRefFromAddressBar keeps the rest of the address exactly as it was", () => {
  const here = () => window.location.pathname + window.location.search + window.location.hash;

  it("does not re-encode the other params (%20, slashes, bare flags, empty values) or the hash", () => {
    window.history.replaceState(null, "", `/en/register?q=a%20b&next=/en/jobs/1&flag&ref=${CODE}&empty=#frag%20x`);
    stripRefFromAddressBar();
    expect(here()).toBe("/en/register?q=a%20b&next=/en/jobs/1&flag&empty=#frag%20x");
  });

  it("removes a ref that is first, last, or repeated, and nothing else", () => {
    window.history.replaceState(null, "", `/en/x?ref=${CODE}&a=1`);
    stripRefFromAddressBar();
    expect(here()).toBe("/en/x?a=1");

    window.history.replaceState(null, "", `/en/x?a=1&ref=${CODE}&ref=MPL-OTHER000000&b=%2B`);
    stripRefFromAddressBar();
    expect(here()).toBe("/en/x?a=1&b=%2B");
  });

  it("does not touch keys that only start with ref", () => {
    window.history.replaceState(null, "", `/en/x?referrer=abc&refx=1&ref=${CODE}`);
    stripRefFromAddressBar();
    expect(here()).toBe("/en/x?referrer=abc&refx=1");
  });

  it("drops the ? when ref was the only param", () => {
    window.history.replaceState(null, "", `/en/x?ref=${CODE}#top`);
    stripRefFromAddressBar();
    expect(here()).toBe("/en/x#top");
  });
});

describe("the strip waits for Next's router (Back button)", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  /**
   * What AppRouter's effect does once it has run: it wraps replaceState so the
   * entry keeps Next's own state (`__NA`, the router tree). A page effect runs
   * BEFORE that (children's effects run first), so a strip done right there
   * replaces the entry's state with null and Back to the page breaks.
   */
  function installNextHistoryPatch() {
    const original = window.history.replaceState.bind(window.history);
    window.history.replaceState = function patched(data: unknown, unused: string, url?: string | URL | null) {
      const state = (data ?? {}) as Record<string, unknown>;
      const current = window.history.state as Record<string, unknown> | null;
      if (current?.__NA) state.__NA = current.__NA;
      if (current?.__PRIVATE_NEXTJS_INTERNALS_TREE) state.__PRIVATE_NEXTJS_INTERNALS_TREE = current.__PRIVATE_NEXTJS_INTERNALS_TREE;
      return original(state, unused, url);
    };
    return () => {
      window.history.replaceState = original;
    };
  }

  it("does nothing in the same tick as the page effect", () => {
    window.history.replaceState(null, "", `/en/register?foo=1&ref=${CODE}`);
    stripRefFromAddressBarSoon();
    expect(window.location.search).toBe(`?foo=1&ref=${CODE}`);
    jest.runOnlyPendingTimers();
    expect(window.location.search).toBe("?foo=1");
  });

  it("keeps Next's history state when the router patch lands between the effect and the strip", () => {
    window.history.replaceState({ __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: ["tree"] }, "", `/en/register?foo=1&ref=${CODE}`);
    stripRefFromAddressBarSoon(); // the page's mount effect
    const restore = installNextHistoryPatch(); // AppRouter's effect, a moment later
    try {
      jest.runOnlyPendingTimers();
      expect(window.location.search).toBe("?foo=1");
      expect(window.history.state).toMatchObject({ __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: ["tree"] });
    } finally {
      restore();
    }
  });

  it("replaceAddressBarSoon is deferred the same way", () => {
    window.history.replaceState(null, "", "/en/login?error=consent_required&provider=linkedin");
    replaceAddressBarSoon("/en/login");
    expect(window.location.search).toContain("provider=linkedin");
    jest.runOnlyPendingTimers();
    expect(window.location.pathname + window.location.search).toBe("/en/login");
  });

  // The target address is fixed when the call is made. If the visitor's navigation lands within
  // that tick, the new page's address must not be overwritten with the old page's.
  describe("a navigation that lands within the tick", () => {
    it("is not overwritten by replaceAddressBarSoon", () => {
      window.history.replaceState(null, "", "/en/login?error=consent_required&provider=linkedin");
      replaceAddressBarSoon("/en/login");
      window.history.pushState(null, "", "/en/jobs/abc?utm=x#apply"); // the next page lands
      jest.runOnlyPendingTimers();
      expect(window.location.pathname + window.location.search + window.location.hash).toBe("/en/jobs/abc?utm=x#apply");
    });

    it("leaves the new page's ref for its own code to read (stripRefFromAddressBarSoon)", () => {
      window.history.replaceState(null, "", `/en/register?ref=${CODE}`);
      stripRefFromAddressBarSoon();
      window.history.pushState(null, "", `/en/jobs/abc?ref=${CODE}`);
      jest.runOnlyPendingTimers();
      expect(window.location.search).toBe(`?ref=${CODE}`);
    });

    it("still rewrites the address when the visitor stays on the page", () => {
      window.history.replaceState(null, "", "/en/login?error=consent_required&provider=apple");
      replaceAddressBarSoon("/en/login");
      jest.runOnlyPendingTimers();
      expect(window.location.pathname + window.location.search).toBe("/en/login");
    });

    it("runs both timers harmlessly twice (React strict mode)", () => {
      window.history.replaceState(null, "", "/en/login?error=consent_required&provider=apple");
      replaceAddressBarSoon("/en/login");
      replaceAddressBarSoon("/en/login");
      jest.runOnlyPendingTimers();
      expect(window.location.pathname + window.location.search).toBe("/en/login");
    });
  });
});
