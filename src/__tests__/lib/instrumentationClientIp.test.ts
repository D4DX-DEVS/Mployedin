/**
 * @jest-environment node
 *
 * Deploy safety: without TRUSTED_CLIENT_IP_HEADER (or Vercel / TRUSTED_PROXY_HOPS)
 * every visitor shares the "direct" rate-limit buckets and every stored IP reads
 * "direct". Start-up must NOT fail over it (the site would be down instead), but
 * a production process logs it as an error through the repo logger, once, when
 * it starts (instrumentation.ts register()).
 */
export {};

const logError = jest.fn();
const logWarn = jest.fn();
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: (...a: unknown[]) => logError(...a), warn: (...a: unknown[]) => logWarn(...a), info: jest.fn() } }));
jest.mock("@/lib/env", () => ({ validateEnv: jest.fn(), collectEnvWarnings: jest.fn(() => []) }));

const env = process.env as Record<string, string | undefined>;
const KEYS = ["NEXT_RUNTIME", "NODE_ENV", "VERCEL", "TRUSTED_CLIENT_IP_HEADER", "TRUSTED_PROXY_HOPS"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  jest.clearAllMocks();
  for (const key of KEYS) saved[key] = env[key];
  env.NEXT_RUNTIME = "nodejs";
  env.NODE_ENV = "production";
  delete env.VERCEL;
  delete env.TRUSTED_CLIENT_IP_HEADER;
  delete env.TRUSTED_PROXY_HOPS;
});
afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete env[key];
    else env[key] = saved[key];
  }
});

const clientIpErrors = () => logError.mock.calls.filter((call) => JSON.stringify(call).includes("TRUSTED_CLIENT_IP_HEADER"));

describe("instrumentation register(): the client-IP source", () => {
  it("logs one error through the logger in production when nothing is configured, and starts anyway", async () => {
    const { register } = await import("@/instrumentation");
    await expect(register()).resolves.toBeUndefined();

    expect(clientIpErrors()).toHaveLength(1);
    expect(JSON.stringify(clientIpErrors()[0])).toContain("do-connecting-ip");
  });

  it("logs nothing about it once TRUSTED_CLIENT_IP_HEADER is set", async () => {
    env.TRUSTED_CLIENT_IP_HEADER = "do-connecting-ip";
    const { register } = await import("@/instrumentation");
    await register();

    expect(clientIpErrors()).toHaveLength(0);
  });

  it("logs nothing about it outside production", async () => {
    env.NODE_ENV = "development";
    const { register } = await import("@/instrumentation");
    await register();

    expect(clientIpErrors()).toHaveLength(0);
  });
});
