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
