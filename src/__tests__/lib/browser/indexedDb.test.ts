/**
 * @jest-environment jsdom
 *
 * Sign-out and the service worker clean-up both delete IndexedDB databases and
 * neither may hang or throw on a stuck, blocked or missing database.
 */
import { deleteIndexedDb } from "@/lib/browser/indexedDb";

type Handlers = { onsuccess?: () => void; onerror?: () => void; onblocked?: () => void };

function installIndexedDb(settle: (request: Handlers) => void) {
  const deleteDatabase = jest.fn(() => {
    const request: Handlers = {};
    // A real request settles asynchronously.
    setTimeout(() => settle(request), 0);
    return request;
  });
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: { deleteDatabase } });
  return deleteDatabase;
}

describe("deleteIndexedDb", () => {
  it("deletes the named database and resolves on success", async () => {
    const deleteDatabase = installIndexedDb((request) => request.onsuccess?.());

    await expect(deleteIndexedDb("some-db")).resolves.toBeUndefined();
    expect(deleteDatabase).toHaveBeenCalledWith("some-db");
  });

  it("resolves when the delete errors", async () => {
    installIndexedDb((request) => request.onerror?.());

    await expect(deleteIndexedDb("some-db")).resolves.toBeUndefined();
  });

  it("resolves when the delete is blocked by an open connection", async () => {
    installIndexedDb((request) => request.onblocked?.());

    await expect(deleteIndexedDb("some-db")).resolves.toBeUndefined();
  });

  it("resolves when deleteDatabase throws", async () => {
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: {
        deleteDatabase: () => {
          throw new Error("SecurityError");
        },
      },
    });

    await expect(deleteIndexedDb("some-db")).resolves.toBeUndefined();
  });

  it("resolves where IndexedDB does not exist", async () => {
    Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: undefined });

    await expect(deleteIndexedDb("some-db")).resolves.toBeUndefined();
  });
});
