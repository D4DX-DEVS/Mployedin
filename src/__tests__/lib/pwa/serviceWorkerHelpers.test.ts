/**
 * @jest-environment jsdom
 *
 * The worker used to register for every visitor on the first page. It now
 * registers only after a user action (Install, Enable notifications) or when
 * the app runs installed. These tests hold the helpers behind that rule.
 */
import {
  isKnownServiceWorkerCache,
  LEGACY_IMAGE_CACHES,
  LEGACY_PERSONAL_DATA_CACHES,
  LEGACY_RUNTIME_CACHES,
} from "@/lib/pwa/cacheNames";
import { enableServiceWorker, hasServiceWorkerOptIn, SW_OPT_IN_KEY } from "@/lib/pwa/enableServiceWorker";
import {
  deleteLegacyRuntimeCaches,
  hasPushSubscription,
  removeServiceWorkerData,
} from "@/lib/pwa/serviceWorkerCleanup";

const mutableEnv = process.env as Record<string, string | undefined>;
const originalNodeEnv = mutableEnv.NODE_ENV;

function installServiceWorker(value: unknown) {
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value });
}

function installCaches(names: string[]) {
  const store = new Set(names);
  const deleteCache = jest.fn(async (name: string) => store.delete(name));
  Object.defineProperty(globalThis, "caches", {
    configurable: true,
    value: { keys: jest.fn(async () => [...store]), delete: deleteCache },
  });
  return { store, deleteCache };
}

function installIndexedDb() {
  const deleteDatabase = jest.fn(() => {
    const request: { onsuccess?: () => void } = {};
    setTimeout(() => request.onsuccess?.(), 0);
    return request;
  });
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: { deleteDatabase } });
  return deleteDatabase;
}

afterEach(() => {
  mutableEnv.NODE_ENV = originalNodeEnv;
  localStorage.clear();
});

describe("isKnownServiceWorkerCache", () => {
  it.each([
    "serwist-precache-v2-https://app.test/",
    "serwist-runtime-https://app.test/",
    "serwist-next-static",
    ...LEGACY_RUNTIME_CACHES,
    ...LEGACY_IMAGE_CACHES,
    "next-static-js-assets",
    "google-fonts-webfonts",
    "google-fonts-stylesheets",
    "static-font-assets",
    "static-audio-assets",
    "static-video-assets",
    "static-js-assets",
    "static-style-assets",
  ])("recognises %s as ours", (name) => {
    expect(isKnownServiceWorkerCache(name)).toBe(true);
  });

  it.each(["some-other-library-cache", "workbox-precache-v2", "my-serwist-thing", "pages-extra"])(
    "leaves %s alone",
    (name) => {
      expect(isKnownServiceWorkerCache(name)).toBe(false);
    },
  );
});

describe("legacy cache lists", () => {
  it("names the old image caches, which held remote photos and same-origin images", () => {
    expect([...LEGACY_IMAGE_CACHES]).toEqual(["next-image", "static-image-assets"]);
  });

  it("purges the runtime and the image caches together, without repeats", () => {
    expect([...LEGACY_PERSONAL_DATA_CACHES]).toEqual([...LEGACY_RUNTIME_CACHES, ...LEGACY_IMAGE_CACHES]);
    expect(new Set(LEGACY_PERSONAL_DATA_CACHES).size).toBe(LEGACY_PERSONAL_DATA_CACHES.length);
  });
});

describe("hasServiceWorkerOptIn", () => {
  it("is false until the flag is exactly '1'", () => {
    expect(hasServiceWorkerOptIn()).toBe(false);
    localStorage.setItem(SW_OPT_IN_KEY, "yes");
    expect(hasServiceWorkerOptIn()).toBe(false);
    localStorage.setItem(SW_OPT_IN_KEY, "1");
    expect(hasServiceWorkerOptIn()).toBe(true);
  });

  it("is false, not a crash, when storage is blocked", () => {
    const spy = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(hasServiceWorkerOptIn()).toBe(false);
    spy.mockRestore();
  });
});

describe("enableServiceWorker", () => {
  beforeEach(() => {
    mutableEnv.NODE_ENV = "production";
  });

  it("sets the opt-in flag and registers /sw.js", async () => {
    const registration = { scope: "/" };
    const register = jest.fn().mockResolvedValue(registration);
    installServiceWorker({ register });

    await expect(enableServiceWorker()).resolves.toBe(registration);

    expect(localStorage.getItem("mployedin_sw_opt_in")).toBe("1");
    expect(register).toHaveBeenCalledWith("/sw.js");
  });

  it("still registers when the flag cannot be stored", async () => {
    const register = jest.fn().mockResolvedValue({});
    installServiceWorker({ register });
    const spy = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    await expect(enableServiceWorker()).resolves.toEqual({});
    expect(register).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("resolves null when registration is rejected", async () => {
    installServiceWorker({ register: jest.fn().mockRejectedValue(new Error("SecurityError")) });

    await expect(enableServiceWorker()).resolves.toBeNull();
  });

  it("resolves null in a browser with no service worker support", async () => {
    installServiceWorker(undefined);
    Reflect.deleteProperty(navigator, "serviceWorker");

    await expect(enableServiceWorker()).resolves.toBeNull();
    expect(localStorage.getItem(SW_OPT_IN_KEY)).toBeNull();
  });

  it("never registers outside production, where the dev cleanup removes workers", async () => {
    mutableEnv.NODE_ENV = "development";
    const register = jest.fn();
    installServiceWorker({ register });

    await expect(enableServiceWorker()).resolves.toBeNull();
    expect(register).not.toHaveBeenCalled();
    expect(localStorage.getItem(SW_OPT_IN_KEY)).toBeNull();
  });
});

describe("removeServiceWorkerData", () => {
  it("unregisters every registration", async () => {
    const a = { unregister: jest.fn().mockResolvedValue(true) };
    const b = { unregister: jest.fn().mockResolvedValue(true) };
    installServiceWorker({ getRegistrations: jest.fn().mockResolvedValue([a, b]) });
    installCaches([]);
    installIndexedDb();

    await removeServiceWorkerData();

    expect(a.unregister).toHaveBeenCalledTimes(1);
    expect(b.unregister).toHaveBeenCalledTimes(1);
  });

  it("deletes known caches by name and leaves unrelated ones", async () => {
    installServiceWorker({ getRegistrations: jest.fn().mockResolvedValue([]) });
    const { store } = installCaches([
      "serwist-precache-v2-https://app.test/",
      "serwist-next-static",
      "apis",
      "pages-rsc",
      "next-image",
      "static-image-assets",
      "next-static-js-assets",
      "google-fonts-webfonts",
      "google-fonts-stylesheets",
      "static-font-assets",
      "static-audio-assets",
      "static-video-assets",
      "static-js-assets",
      "static-style-assets",
      "other-library-cache",
    ]);
    installIndexedDb();

    await removeServiceWorkerData();

    expect([...store]).toEqual(["other-library-cache"]);
  });

  it("deletes the Serwist expiration database when it removed a registration", async () => {
    installServiceWorker({
      getRegistrations: jest.fn().mockResolvedValue([{ unregister: jest.fn().mockResolvedValue(true) }]),
    });
    installCaches([]);
    const deleteDatabase = installIndexedDb();

    await removeServiceWorkerData();

    expect(deleteDatabase).toHaveBeenCalledWith("serwist-expiration");
  });

  it("deletes the Serwist expiration database when it removed a known cache", async () => {
    installServiceWorker({ getRegistrations: jest.fn().mockResolvedValue([]) });
    installCaches(["serwist-next-static"]);
    const deleteDatabase = installIndexedDb();

    await removeServiceWorkerData();

    expect(deleteDatabase).toHaveBeenCalledWith("serwist-expiration");
  });

  it("leaves IndexedDB alone when there is nothing to remove, so an anonymous page load does no work", async () => {
    installServiceWorker({ getRegistrations: jest.fn().mockResolvedValue([]) });
    installCaches(["other-library-cache"]);
    const deleteDatabase = installIndexedDb();

    await removeServiceWorkerData();

    expect(deleteDatabase).not.toHaveBeenCalled();
  });

  it("still clears caches when unregistering throws", async () => {
    installServiceWorker({ getRegistrations: jest.fn().mockRejectedValue(new Error("boom")) });
    const { store } = installCaches(["apis"]);
    installIndexedDb();

    await expect(removeServiceWorkerData()).resolves.toBeUndefined();
    expect(store.size).toBe(0);
  });

  it("resolves where there is no service worker, Cache API or IndexedDB", async () => {
    installServiceWorker(undefined);
    Reflect.deleteProperty(globalThis, "caches");
    Reflect.deleteProperty(globalThis, "indexedDB");

    await expect(removeServiceWorkerData()).resolves.toBeUndefined();
  });
});

describe("deleteLegacyRuntimeCaches", () => {
  it("deletes the old runtime caches by name and nothing else", async () => {
    const { store, deleteCache } = installCaches([
      ...LEGACY_RUNTIME_CACHES,
      ...LEGACY_IMAGE_CACHES,
      "serwist-next-static",
      "other",
    ]);

    await deleteLegacyRuntimeCaches();

    expect([...store].sort()).toEqual(["other", "serwist-next-static"]);
    expect(deleteCache).toHaveBeenCalledTimes(LEGACY_PERSONAL_DATA_CACHES.length);
  });

  it("deletes the old image caches, which held remote photos", async () => {
    const { store } = installCaches(["next-image", "static-image-assets", "serwist-next-image"]);

    await deleteLegacyRuntimeCaches();

    expect([...store]).toEqual(["serwist-next-image"]);
  });

  it("resolves where the Cache API is missing or throws", async () => {
    Reflect.deleteProperty(globalThis, "caches");
    await expect(deleteLegacyRuntimeCaches()).resolves.toBeUndefined();

    Object.defineProperty(globalThis, "caches", {
      configurable: true,
      value: { delete: jest.fn().mockRejectedValue(new Error("SecurityError")) },
    });
    await expect(deleteLegacyRuntimeCaches()).resolves.toBeUndefined();
  });
});

describe("hasPushSubscription", () => {
  it("is true when a registration holds a push subscription", async () => {
    installServiceWorker({
      getRegistrations: jest.fn().mockResolvedValue([
        { pushManager: { getSubscription: jest.fn().mockResolvedValue(null) } },
        { pushManager: { getSubscription: jest.fn().mockResolvedValue({ endpoint: "https://push.test/a" }) } },
      ]),
    });

    await expect(hasPushSubscription()).resolves.toBe(true);
  });

  it("is false with no registration, no subscription, or an error", async () => {
    installServiceWorker({ getRegistrations: jest.fn().mockResolvedValue([]) });
    await expect(hasPushSubscription()).resolves.toBe(false);

    installServiceWorker({
      getRegistrations: jest.fn().mockResolvedValue([{ pushManager: { getSubscription: jest.fn().mockResolvedValue(null) } }]),
    });
    await expect(hasPushSubscription()).resolves.toBe(false);

    installServiceWorker({ getRegistrations: jest.fn().mockRejectedValue(new Error("boom")) });
    await expect(hasPushSubscription()).resolves.toBe(false);
  });
});
