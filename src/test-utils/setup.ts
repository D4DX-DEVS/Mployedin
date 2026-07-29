// Jest setup — loaded after test framework is installed
import "@testing-library/jest-dom";

// CI has no .env — encryption module requires a 32-byte (64 hex char) key.
// Key is read lazily at call time, so setting it here covers all tests.
if (!process.env.ENCRYPTION_KEY) {
  process.env.ENCRYPTION_KEY = "0".repeat(64);
}

// jsdom does not implement ResizeObserver, which several UI components rely on.
// Provide a no-op polyfill so component tests don't crash with "ResizeObserver is not defined".
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
