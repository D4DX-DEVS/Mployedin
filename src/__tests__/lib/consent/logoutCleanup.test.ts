/**
 * @jest-environment jsdom
 *
 * A live audit found that after sign-out the device still held the Firebase
 * user, the job-form draft, Copilot chats, command-menu recents and the push
 * subscription — so the next person on a shared device inherited all of it.
 */
const csrfFetch = jest.fn();
jest.mock("@/lib/security/csrf-client", () => ({
  csrfFetch: (...args: unknown[]) => csrfFetch(...args),
}));

import { logoutCleanup } from "@/lib/consent/logoutCleanup";
import { isSignOutInProgress, markSignOutStarted, resetSignOutInProgress } from "@/lib/consent/deviceStorage";

interface FakeSubscription {
  endpoint: string;
  unsubscribe: jest.Mock;
}

function installServiceWorker(sub: FakeSubscription | null) {
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      getRegistration: jest.fn().mockResolvedValue({
        pushManager: { getSubscription: jest.fn().mockResolvedValue(sub) },
      }),
    },
  });
}

const deleteDatabase = jest.fn();

function installIndexedDb() {
  deleteDatabase.mockImplementation(() => {
    const request: { onsuccess?: () => void } = {};
    // A real request settles asynchronously.
    setTimeout(() => request.onsuccess?.(), 0);
    return request;
  });
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: { deleteDatabase } });
}

const TAB_KEYS = [
  "job-ai-prefill",
  "job-ai-extract-snapshot",
  "job-ai-chat-session",
  "job-prefs-draft",
  "employer-candidate-matching-session-v1",
  "copilot-chats",
];

describe("logoutCleanup", () => {
  beforeEach(() => {
    jest.useRealTimers();
    resetSignOutInProgress();
    localStorage.clear();
    sessionStorage.clear();
    csrfFetch.mockReset().mockResolvedValue({ ok: true });
    deleteDatabase.mockReset();
    installIndexedDb();
    installServiceWorker(null);
    Reflect.deleteProperty(globalThis, "caches");
  });

  it("expires the sign-up consent cookie (the Terms tick and a referral code), so the next person can't reuse it", async () => {
    document.cookie = "mpl_signup_consent=t1.c.ref-ABC123; Path=/";
    expect(document.cookie).toContain("mpl_signup_consent=");

    await logoutCleanup();

    expect(document.cookie).not.toContain("mpl_signup_consent=");
  });

  it("removes the tab session data a previous user left behind", async () => {
    for (const key of TAB_KEYS) sessionStorage.setItem(key, "x");
    sessionStorage.setItem("job-draft-user-1", "x");
    sessionStorage.setItem("ai-thread-abc", "x");
    sessionStorage.setItem("ai_insights_abc", "x");
    sessionStorage.setItem("unrelated-tab-key", "keep");

    await logoutCleanup();

    for (const key of TAB_KEYS) expect(sessionStorage.getItem(key)).toBeNull();
    expect(sessionStorage.getItem("job-draft-user-1")).toBeNull();
    expect(sessionStorage.getItem("ai-thread-abc")).toBeNull();
    expect(sessionStorage.getItem("ai_insights_abc")).toBeNull();
    expect(sessionStorage.getItem("unrelated-tab-key")).toBe("keep");
  });

  it("removes poster edits and the temporary-password dismissal from the tab (they hold work and a user id)", async () => {
    sessionStorage.setItem("poster-edit:gen1", "{}");
    sessionStorage.setItem("poster-edit:gen2", "{}");
    sessionStorage.setItem("mployedin:temp-password-notice-dismissed:user-1", "1");
    sessionStorage.setItem("poster-editor", "keep"); // looks similar, is not a poster-edit:<id> key

    await logoutCleanup();

    expect(sessionStorage.getItem("poster-edit:gen1")).toBeNull();
    expect(sessionStorage.getItem("poster-edit:gen2")).toBeNull();
    expect(sessionStorage.getItem("mployedin:temp-password-notice-dismissed:user-1")).toBeNull();
    expect(sessionStorage.getItem("poster-editor")).toBe("keep");
  });

  it("removes the idle tracker and the legacy localStorage copies, and nothing else", async () => {
    localStorage.setItem("mployedin_last_activity", "1");
    localStorage.setItem("copilot-chats", "[]");
    localStorage.setItem("job-draft-user-1", "{}");
    localStorage.setItem("job-draft-anonymous", "{}");
    localStorage.setItem("mployedin_recent_pages_en", "[]");
    localStorage.setItem("mployedin_recent_pages_ar", "[]");
    localStorage.setItem("mployedin_remember_email", "me@example.com");

    await logoutCleanup();

    expect(localStorage.getItem("mployedin_last_activity")).toBeNull();
    expect(localStorage.getItem("copilot-chats")).toBeNull();
    expect(localStorage.getItem("job-draft-user-1")).toBeNull();
    expect(localStorage.getItem("job-draft-anonymous")).toBeNull();
    expect(localStorage.getItem("mployedin_recent_pages_en")).toBeNull();
    expect(localStorage.getItem("mployedin_recent_pages_ar")).toBeNull();
    // The person ticked "remember me" on purpose; signing out does not undo it.
    expect(localStorage.getItem("mployedin_remember_email")).toBe("me@example.com");
  });

  it("deletes the Firebase IndexedDB databases", async () => {
    await logoutCleanup();

    expect(deleteDatabase).toHaveBeenCalledWith("firebaseLocalStorageDb");
    expect(deleteDatabase).toHaveBeenCalledWith("firebase-heartbeat-database");
  });

  it("removes the push subscription on the server, with CSRF, then in the browser", async () => {
    const sub = { endpoint: "https://push.example/abc", unsubscribe: jest.fn().mockResolvedValue(true) };
    installServiceWorker(sub);

    await logoutCleanup();

    const pushCalls = csrfFetch.mock.calls.filter(([url]) => url === "/api/push/subscription");
    expect(pushCalls).toHaveLength(1);
    const [url, init] = pushCalls[0];
    expect(url).toBe("/api/push/subscription");
    expect(init.method).toBe("DELETE");
    expect(JSON.parse(init.body)).toEqual({ endpoint: "https://push.example/abc" });
    expect(sub.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("still unsubscribes the browser when the server call fails", async () => {
    const sub = { endpoint: "https://push.example/abc", unsubscribe: jest.fn().mockResolvedValue(true) };
    installServiceWorker(sub);
    csrfFetch.mockRejectedValue(new Error("offline"));

    await expect(logoutCleanup()).resolves.toBeUndefined();

    expect(sub.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("does not call the push endpoint when there is no push subscription", async () => {
    await logoutCleanup();

    expect(csrfFetch).not.toHaveBeenCalledWith("/api/push/subscription", expect.anything());
  });

  it("clears storage even when the push step throws", async () => {
    sessionStorage.setItem("job-prefs-draft", "x");
    localStorage.setItem("copilot-chats", "[]");
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { getRegistration: jest.fn().mockRejectedValue(new Error("no worker")) },
    });

    await expect(logoutCleanup()).resolves.toBeUndefined();

    expect(sessionStorage.getItem("job-prefs-draft")).toBeNull();
    expect(localStorage.getItem("copilot-chats")).toBeNull();
  });

  it("clears storage first and does not hang sign-out on a stuck push service", async () => {
    jest.useFakeTimers();
    sessionStorage.setItem("job-prefs-draft", "x");
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { getRegistration: jest.fn(() => new Promise(() => {})) },
    });

    const done = jest.fn();
    void logoutCleanup().then(done);

    // Storage is wiped before anything slow is awaited.
    expect(sessionStorage.getItem("job-prefs-draft")).toBeNull();
    expect(done).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(5_000);
    expect(done).toHaveBeenCalled();
  });

  it("does not throw when storage and IndexedDB are unavailable", async () => {
    Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: undefined });
    const removeItemSpy = jest.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    await expect(logoutCleanup()).resolves.toBeUndefined();

    removeItemSpy.mockRestore();
  });

  it("still clears storage and resolves in a browser with no service worker support", async () => {
    sessionStorage.setItem("job-prefs-draft", "x");
    localStorage.setItem("job-draft-user-1", "{}");
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: undefined });

    await expect(logoutCleanup()).resolves.toBeUndefined();

    expect(sessionStorage.getItem("job-prefs-draft")).toBeNull();
    expect(localStorage.getItem("job-draft-user-1")).toBeNull();
    expect(csrfFetch).not.toHaveBeenCalledWith("/api/push/subscription", expect.anything());
  });

  describe("browser HTTP cache", () => {
    // Authenticated API routes reply with `Cache-Control: private, max-age=...`,
    // so the browser kept the previous user's lists after sign-out and served
    // them offline. The server's Clear-Site-Data reply empties that cache.
    const cacheCalls = () => csrfFetch.mock.calls.filter(([url]) => url === "/api/session/clear-cache");

    it("asks the server to clear the browser cache, with CSRF, via POST", async () => {
      await logoutCleanup();

      expect(cacheCalls()).toHaveLength(1);
      expect(cacheCalls()[0][1]).toEqual({ method: "POST" });
    });

    it("asks even when there is no push subscription and no service worker", async () => {
      Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: undefined });

      await logoutCleanup();

      expect(cacheCalls()).toHaveLength(1);
    });

    it("does not stop the rest of the cleanup when the request is rejected", async () => {
      const sub = { endpoint: "https://push.example/abc", unsubscribe: jest.fn().mockResolvedValue(true) };
      installServiceWorker(sub);
      sessionStorage.setItem("job-prefs-draft", "x");
      csrfFetch.mockRejectedValue(new Error("offline"));

      await expect(logoutCleanup()).resolves.toBeUndefined();

      expect(cacheCalls()).toHaveLength(1);
      expect(sessionStorage.getItem("job-prefs-draft")).toBeNull();
      expect(sub.unsubscribe).toHaveBeenCalledTimes(1);
      expect(deleteDatabase).toHaveBeenCalledWith("firebaseLocalStorageDb");
    });

    it("does not stop the cleanup when the request throws before returning a promise", async () => {
      csrfFetch.mockImplementation(() => {
        throw new Error("fetch is not available");
      });

      await expect(logoutCleanup()).resolves.toBeUndefined();

      expect(deleteDatabase).toHaveBeenCalledWith("firebaseLocalStorageDb");
    });

    it("does not hang sign-out when the request never answers", async () => {
      jest.useFakeTimers();
      csrfFetch.mockImplementation(() => new Promise(() => {}));

      const done = jest.fn();
      void logoutCleanup().then(done);
      expect(done).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(5_000);
      expect(done).toHaveBeenCalled();
    });
  });

  describe("old service worker caches", () => {
    // Before the worker stopped caching personal data it kept /api replies and
    // pages for 24 hours. A device whose worker has not updated yet would still
    // hold them after sign-out, so the page clears them by name as well.
    const LEGACY = ["apis", "pages", "pages-rsc", "pages-rsc-prefetch", "others", "cross-origin", "next-data", "static-data-assets"];

    function installCaches(names: string[]) {
      const store = new Set(names);
      Object.defineProperty(globalThis, "caches", {
        configurable: true,
        value: { delete: jest.fn(async (name: string) => store.delete(name)) },
      });
      return store;
    }

    it("deletes the legacy runtime caches by name and leaves every other cache", async () => {
      const store = installCaches([...LEGACY, "serwist-next-static", "other-library-cache"]);

      await logoutCleanup();

      expect([...store].sort()).toEqual(["other-library-cache", "serwist-next-static"]);
    });

    it("deletes the old image caches too, which held remote photos", async () => {
      const store = installCaches(["next-image", "static-image-assets", "serwist-next-image"]);

      await logoutCleanup();

      expect([...store]).toEqual(["serwist-next-image"]);
    });

    it("does not throw when the Cache API is unavailable", async () => {
      await expect(logoutCleanup()).resolves.toBeUndefined();
    });

    it("does not throw, and still clears storage, when deleting a cache is rejected", async () => {
      sessionStorage.setItem("job-prefs-draft", "x");
      Object.defineProperty(globalThis, "caches", {
        configurable: true,
        value: { delete: jest.fn().mockRejectedValue(new Error("SecurityError")) },
      });

      await expect(logoutCleanup()).resolves.toBeUndefined();

      expect(sessionStorage.getItem("job-prefs-draft")).toBeNull();
    });
  });

  describe("sign-out in progress", () => {
    it("is off until a cleanup starts", () => {
      expect(isSignOutInProgress()).toBe(false);
    });

    it("turns on as soon as the cleanup starts, so a late autosave knows not to write", async () => {
      const done = logoutCleanup();

      expect(isSignOutInProgress()).toBe(true);
      await done;
      expect(isSignOutInProgress()).toBe(true);
    });

    // A sign-out that never navigates (a client-side router.replace, a failure
    // nobody reset) must not leave autosave off for a person who is still signed in.
    it("expires by itself, so a person who stays signed in gets autosave back", () => {
      jest.useFakeTimers();
      markSignOutStarted();

      jest.advanceTimersByTime(14_000);
      expect(isSignOutInProgress()).toBe(true);

      jest.advanceTimersByTime(2_000);
      expect(isSignOutInProgress()).toBe(false);
    });

    it("can be switched off again if the sign-out fails and the person stays", async () => {
      await logoutCleanup();

      resetSignOutInProgress();

      expect(isSignOutInProgress()).toBe(false);
    });
  });
});
