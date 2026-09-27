/* Keep storage call sites safe when browser storage is blocked. */
(() => {
  const install = (name) => {
    try {
      window[name].getItem("__probe__");
      return;
    } catch {
      /* Continue with the in-memory fallback. */
    }

    const map = new Map();
    const storage = {
      getItem: (key) => (map.has(String(key)) ? map.get(String(key)) : null),
      setItem: (key, value) => { map.set(String(key), String(value)); },
      removeItem: (key) => { map.delete(String(key)); },
      clear: () => { map.clear(); },
      key: (index) => {
        const keys = Array.from(map.keys());
        return index in keys ? keys[index] : null;
      },
    };
    Object.defineProperty(storage, "length", { get: () => map.size });

    try {
      Object.defineProperty(window, name, { configurable: true, get: () => storage });
    } catch {
      /* Property is locked down too; callers still need their own guards. */
    }
  };

  install("localStorage");
  install("sessionStorage");
})();
