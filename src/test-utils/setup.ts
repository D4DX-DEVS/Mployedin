// Jest setup — loaded after test framework is installed
import "@testing-library/jest-dom";

// CI has no .env — encryption module requires a 32-byte (64 hex char) key.
// Key is read lazily at call time, so setting it here covers all tests.
if (!process.env.ENCRYPTION_KEY) {
  process.env.ENCRYPTION_KEY = "0".repeat(64);
}

// Tests must never talk to the real Upstash rate-limit store: the bucket is
// shared and persistent, so repeated local runs saturate it and rate-limited
// routes start returning 429 in unrelated tests. Blank creds force the
// limiter's in-memory fallback, which resets per process.
process.env.UPSTASH_REDIS_REST_URL = "";
process.env.UPSTASH_REDIS_REST_TOKEN = "";

// Same idea for reCAPTCHA: next/jest loads the developer's .env, so real keys
// there would make the quick-apply client try to load Google's script in jsdom
// (hangs the EasyApply tests) and make server tests call Google for real.
// Tests that exercise the gate set these explicitly.
process.env.RECAPTCHA_SECRET_KEY = "";
process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY = "";
process.env.RECAPTCHA_ALLOWED_HOSTS = "";

// jsdom does not implement ResizeObserver, which several UI components rely on.
// Provide a no-op polyfill so component tests don't crash with "ResizeObserver is not defined".
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
