/**
 * Keeps `window.localStorage` / `window.sessionStorage` usable when the browser
 * refuses them.
 *
 * Reading the property itself throws — not just `setItem` — in Firefox with
 * `dom.storage.enabled=false`, in Chrome when site data is blocked for the
 * origin, and in some enterprise-managed profiles. The app touches storage from
 * ~70 call sites across 24 files (theme, cookie consent, copilot, drafts, idle
 * timeout, …). One of those runs in a `useEffect` during hydration, so a throw
 * there took the whole page down to the global error boundary: users with site
 * data blocked saw "Something went wrong" instead of the site.
 *
 * Guarding all 70 sites would be churn that the next new call site undoes.
 * Instead, swap in an in-memory Storage once, before hydration, so every
 * existing call keeps working. The only loss is persistence across reloads —
 * which is exactly what blocking storage asks for.
 *
 * Runs as a blocking inline <head> script so it is in place before any
 * component effect. Keep it dependency-free and small.
 */
export function getStorageFallbackScript(): string {
  return `(() => {
    const install = (name) => {
      try {
        window[name].getItem("__probe__");
        return;
      } catch {}

      const map = new Map();
      const storage = {
        getItem: (key) => (map.has(String(key)) ? map.get(String(key)) : null),
        setItem: (key, value) => { map.set(String(key), String(value)); },
        removeItem: (key) => { map.delete(String(key)); },
        clear: () => { map.clear(); },
        key: (index) => { const keys = Array.from(map.keys()); return index in keys ? keys[index] : null; },
      };
      Object.defineProperty(storage, "length", { get: () => map.size });

      try {
        Object.defineProperty(window, name, { configurable: true, get: () => storage });
      } catch {
        /* Property is locked down too — call sites keep their own guards. */
      }
    };

    install("localStorage");
    install("sessionStorage");
  })();`;
}
