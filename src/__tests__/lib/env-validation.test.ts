/**
 * @jest-environment node
 */

const BASE_ENV = {
  MONGODB_URI: "mongodb://localhost:27017/test",
  NEXTAUTH_SECRET: "x".repeat(40),
  ENCRYPTION_KEY: "a".repeat(64),
  CRON_SECRET: "cron-secret-that-is-long-enough",
  SPACES_ACCESS_KEY_ID: "key",
  SPACES_SECRET_ACCESS_KEY: "secret",
};

function loadValidateEnv(env: Record<string, string | undefined>) {
  const saved = { ...process.env };
  for (const key of Object.keys(process.env)) {
    if (/^(MONGODB_URI|NEXTAUTH_SECRET|ENCRYPTION_KEY|CRON_SECRET|SPACES_|UPSTASH_)/.test(key)) delete process.env[key];
  }
  Object.assign(process.env, env);
  let validateEnv: () => void = () => undefined;
  jest.isolateModules(() => {
    ({ validateEnv } = require("@/lib/env"));
  });
  const restore = () => {
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, saved);
  };
  return { validateEnv, restore };
}

describe("validateEnv — distributed rate limiting is mandatory in production", () => {
  it("fails at boot in production when the Upstash rate-limit store is not configured", () => {
    const { validateEnv, restore } = loadValidateEnv({ ...BASE_ENV, NODE_ENV: "production" });
    try {
      expect(() => validateEnv()).toThrow(/UPSTASH_REDIS_REST_URL/);
    } finally {
      restore();
    }
  });

  it("passes in production once both Upstash variables are present", () => {
    const { validateEnv, restore } = loadValidateEnv({
      ...BASE_ENV,
      NODE_ENV: "production",
      UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "token",
    });
    try {
      expect(() => validateEnv()).not.toThrow();
    } finally {
      restore();
    }
  });

  it("keeps the in-memory fallback available outside production", () => {
    const { validateEnv, restore } = loadValidateEnv({ ...BASE_ENV, NODE_ENV: "development" });
    try {
      expect(() => validateEnv()).not.toThrow();
    } finally {
      restore();
    }
  });
});
