// Jest setup — loaded after test framework is installed
import "@testing-library/jest-dom";

// jsdom does not implement ResizeObserver, which several UI components rely on.
// Provide a no-op polyfill so component tests don't crash with "ResizeObserver is not defined".
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
