/**
 * Deletes an IndexedDB database and resolves whatever happens: success, error,
 * "blocked", a throw, or no IndexedDB at all (private modes, old browsers).
 * Callers are clean-up paths that must never fail or wait on a stuck database.
 */
export function deleteIndexedDb(name: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.deleteDatabase(name);
      // "blocked" means a connection is still open; the delete completes when
      // that closes (or the page unloads), which is not worth waiting for.
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}
