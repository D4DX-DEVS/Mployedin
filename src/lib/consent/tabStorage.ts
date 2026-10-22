/**
 * The tab's own storage (sessionStorage) for work in progress and one-off
 * dismissals: things that are the visitor's own content or that carry a user id
 * in their key. They are not preferences, so unlike prefStorage this never
 * reaches localStorage, whatever the visitor chose about cookies, and it ends
 * with the tab. Registry rows for these keys live in registry.ts (sessionStorage,
 * "tab"). Never throws: blocked storage reads as "nothing saved".
 */
export const tabStorage = {
  get(key: string): string | null {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      sessionStorage.setItem(key, value);
    } catch {
      // Blocked or full: the work is simply not kept across a reload.
    }
  },
};
