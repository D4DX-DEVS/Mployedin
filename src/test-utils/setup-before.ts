/**
 * Pino 10 uses diagnostics_channel.tracingChannel, which was added in
 * Node 18.19. The repository targets Node 22, but keeping a tiny no-op
 * compatibility shim here lets the test suite run on older developer images
 * without changing production logging behavior.
 */
const diagnosticsChannel = require("node:diagnostics_channel") as {
  channel: (name: string) => { hasSubscribers: boolean };
  tracingChannel?: (name: string) => unknown;
};

if (typeof diagnosticsChannel.tracingChannel !== "function") {
  Object.defineProperty(diagnosticsChannel, "tracingChannel", {
    configurable: true,
    value: (name: string) => {
      const channel = diagnosticsChannel.channel(name) as {
        hasSubscribers: boolean;
      };
      return {
        get hasSubscribers() {
          return channel.hasSubscribers;
        },
        traceSync<T>(fn: (...args: unknown[]) => T, _store: unknown, thisArg: unknown, ...args: unknown[]) {
          return fn.apply(thisArg, args);
        },
      };
    },
  });
}

/**
 * The Cloudflare storage switches come from the developer's .env (next/jest
 * loads it): with them set, the CSP gains R2 hosts and log writes would try to
 * reach the real data Worker. Every test file starts with them unset, so the
 * suite gives the same result whatever .env holds; a test that needs one sets it.
 */
for (const name of [
  "STORAGE_PROVIDER",
  "R2_ACCOUNT_ID",
  "CLOUDFLARE_ACCOUNT_ID",
  "R2_ENDPOINT",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_PUBLIC_BUCKET",
  "R2_BUCKET_NAME",
  "R2_PRIVATE_BUCKET",
  "R2_PUBLIC_ENDPOINT",
  "R2_JURISDICTION",
  "NEXT_PUBLIC_R2_PUBLIC_HOST",
  "NEXT_PUBLIC_IMAGE_TRANSFORMS",
  "DATA_WORKER_URL",
  "DATA_WORKER_SECRET",
  "LOGS_STORE",
  "VECTOR_STORE",
  "SEARCH_VECTOR_STORE",
]) {
  delete process.env[name];
}
