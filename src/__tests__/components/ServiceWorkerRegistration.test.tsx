/**
 * @jest-environment jsdom
 *
 * A live audit on a production build showed the worker registering for every
 * visitor on the first page, then caching admin API replies and dashboard pages
 * that stayed readable after sign-out. It must now register only after a user
 * action (the opt-in flag set by Install / Enable notifications) or when the
 * app already runs installed, and clean up after itself otherwise.
 */
import { render, waitFor } from "@testing-library/react";
import { ServiceWorkerRegistration } from "@/components/shared/ServiceWorkerRegistration";

const mutableEnv = process.env as Record<string, string | undefined>;
const originalNodeEnv = mutableEnv.NODE_ENV;

const register = jest.fn();
const getRegistrations = jest.fn();
const addEventListener = jest.fn();
const deleteDatabase = jest.fn();
let cacheStore: Set<string>;

function installBrowser({ standalone = false, controller = null as unknown } = {}) {
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { controller, register, getRegistrations, addEventListener },
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: standalone && query.includes("display-mode: standalone"),
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }),
  });
  cacheStore = new Set([
    "serwist-precache-v2-https://app.test/",
    "serwist-next-static",
    "apis",
    "pages",
    "pages-rsc",
    "next-image",
    "static-image-assets",
    "other-library-cache",
  ]);
  Object.defineProperty(globalThis, "caches", {
    configurable: true,
    value: {
      keys: jest.fn(async () => [...cacheStore]),
      delete: jest.fn(async (name: string) => cacheStore.delete(name)),
    },
  });
  deleteDatabase.mockImplementation(() => {
    const request: { onsuccess?: () => void } = {};
    setTimeout(() => request.onsuccess?.(), 0);
    return request;
  });
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: { deleteDatabase } });
}

const registrationWithoutPush = () => ({
  unregister: jest.fn().mockResolvedValue(true),
  pushManager: { getSubscription: jest.fn().mockResolvedValue(null) },
});

beforeEach(() => {
  mutableEnv.NODE_ENV = "production";
  localStorage.clear();
  sessionStorage.clear();
  register.mockReset().mockResolvedValue({ update: jest.fn() });
  getRegistrations.mockReset().mockResolvedValue([]);
  addEventListener.mockReset();
  deleteDatabase.mockReset();
});

afterEach(() => {
  mutableEnv.NODE_ENV = originalNodeEnv;
});

describe("ServiceWorkerRegistration in production", () => {
  describe("with no opt-in and not installed", () => {
    it("does not register a worker", async () => {
      installBrowser();
      getRegistrations.mockResolvedValue([]);

      render(<ServiceWorkerRegistration />);

      await waitFor(() => expect(getRegistrations).toHaveBeenCalled());
      expect(register).not.toHaveBeenCalled();
      expect(addEventListener).not.toHaveBeenCalled();
      expect(localStorage.getItem("mployedin_sw_opt_in")).toBeNull();
    });

    it("unregisters an existing worker and deletes this site's caches by name", async () => {
      installBrowser();
      const existing = registrationWithoutPush();
      getRegistrations.mockResolvedValue([existing]);

      render(<ServiceWorkerRegistration />);

      await waitFor(() => expect(existing.unregister).toHaveBeenCalledTimes(1));
      await waitFor(() => expect([...cacheStore]).toEqual(["other-library-cache"]));
      expect(deleteDatabase).toHaveBeenCalledWith("serwist-expiration");
      expect(register).not.toHaveBeenCalled();
    });

    it("keeps a worker that holds a push subscription and records that as the opt-in", async () => {
      // Someone who enabled notifications before this change took a user action
      // already; unregistering would silently end their pushes.
      installBrowser();
      const subscribed = {
        unregister: jest.fn().mockResolvedValue(true),
        pushManager: { getSubscription: jest.fn().mockResolvedValue({ endpoint: "https://push.test/a" }) },
      };
      getRegistrations.mockResolvedValue([subscribed]);

      render(<ServiceWorkerRegistration />);

      await waitFor(() => expect(register).toHaveBeenCalledWith("/sw.js"));
      expect(subscribed.unregister).not.toHaveBeenCalled();
      expect(localStorage.getItem("mployedin_sw_opt_in")).toBe("1");
      // The old runtime caches hold personal data and go either way.
      await waitFor(() => expect(cacheStore.has("apis")).toBe(false));
      expect(cacheStore.has("pages")).toBe(false);
      expect(cacheStore.has("pages-rsc")).toBe(false);
    });

    it("does nothing in a browser without service worker support", () => {
      Reflect.deleteProperty(navigator, "serviceWorker");

      expect(() => render(<ServiceWorkerRegistration />)).not.toThrow();
      expect(register).not.toHaveBeenCalled();
    });

    it("does not throw when clean-up fails", async () => {
      installBrowser();
      getRegistrations.mockRejectedValue(new Error("SecurityError"));

      expect(() => render(<ServiceWorkerRegistration />)).not.toThrow();
      await waitFor(() => expect(getRegistrations).toHaveBeenCalled());
      expect(register).not.toHaveBeenCalled();
    });
  });

  describe("after a user action", () => {
    it("registers when the app runs installed (standalone display mode)", async () => {
      installBrowser({ standalone: true });

      render(<ServiceWorkerRegistration />);

      await waitFor(() => expect(register).toHaveBeenCalledWith("/sw.js"));
      expect(getRegistrations).not.toHaveBeenCalled();
    });

    it("records the opt-in when the app runs installed, so a later normal-tab visit keeps the worker", async () => {
      installBrowser({ standalone: true });

      render(<ServiceWorkerRegistration />);

      await waitFor(() => expect(register).toHaveBeenCalledWith("/sw.js"));
      expect(localStorage.getItem("mployedin_sw_opt_in")).toBe("1");
    });

    it("still registers when storage is blocked while running installed", async () => {
      installBrowser({ standalone: true });
      const spy = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });

      render(<ServiceWorkerRegistration />);

      await waitFor(() => expect(register).toHaveBeenCalledWith("/sw.js"));
      spy.mockRestore();
    });

    it("keeps the worker in a normal tab once an installed run recorded the opt-in", async () => {
      installBrowser({ standalone: true });
      const first = render(<ServiceWorkerRegistration />);
      await waitFor(() => expect(register).toHaveBeenCalledTimes(1));
      first.unmount();

      installBrowser({ standalone: false });
      render(<ServiceWorkerRegistration />);

      await waitFor(() => expect(register).toHaveBeenCalledTimes(2));
      expect(getRegistrations).not.toHaveBeenCalled();
    });

    it("registers when the opt-in flag is set", async () => {
      installBrowser();
      localStorage.setItem("mployedin_sw_opt_in", "1");

      render(<ServiceWorkerRegistration />);

      await waitFor(() => expect(register).toHaveBeenCalledWith("/sw.js"));
      expect(getRegistrations).not.toHaveBeenCalled();
      expect(cacheStore.has("serwist-next-static")).toBe(true);
    });

    it("does not treat any other value of the flag as an opt-in", async () => {
      installBrowser();
      localStorage.setItem("mployedin_sw_opt_in", "0");

      render(<ServiceWorkerRegistration />);

      await waitFor(() => expect(getRegistrations).toHaveBeenCalled());
      expect(register).not.toHaveBeenCalled();
    });

    it("deletes the old runtime caches that held personal data, and only those", async () => {
      installBrowser();
      localStorage.setItem("mployedin_sw_opt_in", "1");

      render(<ServiceWorkerRegistration />);

      await waitFor(() => expect(cacheStore.has("apis")).toBe(false));
      expect(cacheStore.has("pages")).toBe(false);
      expect(cacheStore.has("pages-rsc")).toBe(false);
      expect(cacheStore.has("serwist-precache-v2-https://app.test/")).toBe(true);
      expect(cacheStore.has("other-library-cache")).toBe(true);
    });

    it("also deletes the old image caches, which held remote photos", async () => {
      installBrowser();
      localStorage.setItem("mployedin_sw_opt_in", "1");

      render(<ServiceWorkerRegistration />);

      await waitFor(() => expect(cacheStore.has("next-image")).toBe(false));
      expect(cacheStore.has("static-image-assets")).toBe(false);
      expect(cacheStore.has("serwist-next-static")).toBe(true);
    });

    it("still reloads once on a worker hand-over, so document and worker are one build", async () => {
      installBrowser({ controller: {} });
      localStorage.setItem("mployedin_sw_opt_in", "1");

      render(<ServiceWorkerRegistration />);

      await waitFor(() => expect(register).toHaveBeenCalled());
      expect(addEventListener).toHaveBeenCalledWith("controllerchange", expect.any(Function));
    });

    it("does not break the page when registration is rejected", async () => {
      installBrowser({ standalone: true });
      const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
      register.mockRejectedValue(new Error("SecurityError"));

      render(<ServiceWorkerRegistration />);

      await waitFor(() => expect(consoleError).toHaveBeenCalled());
      consoleError.mockRestore();
    });
  });
});

describe("ServiceWorkerRegistration outside production", () => {
  it("never registers, and removes leftover workers and all caches", async () => {
    mutableEnv.NODE_ENV = "development";
    installBrowser({ standalone: true });
    localStorage.setItem("mployedin_sw_opt_in", "1");
    const leftover = registrationWithoutPush();
    getRegistrations.mockResolvedValue([leftover]);

    render(<ServiceWorkerRegistration />);

    await waitFor(() => expect(leftover.unregister).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(cacheStore.size).toBe(0));
    expect(register).not.toHaveBeenCalled();
  });
});
