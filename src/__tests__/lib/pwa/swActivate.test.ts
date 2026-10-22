/**
 * @jest-environment jsdom
 *
 * The previous worker cached /api replies and pages in `apis`, `pages` and
 * friends, and remote photos in `next-image` / `static-image-assets`. This
 * worker writes none of them, so it deletes what the old one left behind when
 * it activates. sw.ts is a worker entry, so it is loaded here with Serwist
 * mocked and `self.addEventListener` captured.
 */
jest.mock("serwist", () => ({
  Serwist: class {
    addEventListeners() {}
  },
  NetworkOnly: class {},
  CacheFirst: class {},
  ExpirationPlugin: class {},
}));

import { LEGACY_IMAGE_CACHES, LEGACY_RUNTIME_CACHES } from "@/lib/pwa/cacheNames";

type Listener = (event: unknown) => void;

function loadWorker(): Record<string, Listener> {
  const listeners: Record<string, Listener> = {};
  const spy = jest.spyOn(window, "addEventListener").mockImplementation(((type: string, listener: Listener) => {
    listeners[type] = listener;
  }) as typeof window.addEventListener);
  jest.isolateModules(() => {
    require("@/app/sw");
  });
  spy.mockRestore();
  return listeners;
}

describe("service worker activate", () => {
  it("deletes the old runtime and image caches by name, and nothing else", async () => {
    const deleted: string[] = [];
    Object.defineProperty(globalThis, "caches", {
      configurable: true,
      value: {
        delete: jest.fn(async (name: string) => {
          deleted.push(name);
          return true;
        }),
      },
    });
    const listeners = loadWorker();
    let pending: Promise<unknown> | undefined;

    listeners.activate({ waitUntil: (promise: Promise<unknown>) => (pending = promise) });
    await pending;

    expect(deleted.sort()).toEqual([...LEGACY_RUNTIME_CACHES, ...LEGACY_IMAGE_CACHES].sort());
    expect(deleted).toEqual(expect.arrayContaining(["apis", "pages", "pages-rsc", "next-image", "static-image-assets"]));
    expect(deleted.some((name) => name.startsWith("serwist-"))).toBe(false);
  });

  it("keeps the push and notification handlers", () => {
    const listeners = loadWorker();

    expect(typeof listeners.push).toBe("function");
    expect(typeof listeners.notificationclick).toBe("function");
  });
});
