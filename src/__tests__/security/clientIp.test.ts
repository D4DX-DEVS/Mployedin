/**
 * @jest-environment node
 */
import {
  FALLBACK_CLIENT,
  clientIpConfigurationProblem,
  clientIpHealth,
  getClientIp,
  resetClientIpWarningsForTests,
  withTrustedClientIp,
} from "@/lib/security/clientIp";

const ENV_KEYS = ["VERCEL", "TRUSTED_PROXY_HOPS", "TRUSTED_CLIENT_IP_HEADER", "NODE_ENV"] as const;

const env = process.env as Record<string, string | undefined>;
const saved: Record<string, string | undefined> = {};

let warn: jest.SpyInstance;

function headers(init: Record<string, string>): Headers {
  return new Headers(init);
}

function warnings(): string[] {
  return warn.mock.calls.map((call) => String(call[0]));
}

beforeEach(() => {
  for (const key of ENV_KEYS) saved[key] = env[key];
  delete env.VERCEL;
  delete env.TRUSTED_PROXY_HOPS;
  delete env.TRUSTED_CLIENT_IP_HEADER;
  env.NODE_ENV = "test";
  resetClientIpWarningsForTests();
  warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  warn.mockRestore();
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete env[key];
    else env[key] = saved[key];
  }
});

describe("getClientIp: default (nothing configured)", () => {
  it("exports the shared-client constant so callers compare against it instead of hard-coding it", () => {
    expect(FALLBACK_CLIENT).toBe("direct");
    expect(getClientIp(headers({}))).toBe(FALLBACK_CLIENT);
  });

  it("ignores a forged cf-connecting-ip: every caller is the shared \"direct\" client", () => {
    expect(getClientIp(headers({ "cf-connecting-ip": "203.0.113.9" }))).toBe("direct");
  });

  it("gives a caller who sends a different cf-connecting-ip each time no fresh bucket", () => {
    const seen = new Set<string>();
    for (let i = 1; i <= 50; i++) seen.add(getClientIp(headers({ "cf-connecting-ip": `198.51.100.${i}` })));
    expect([...seen]).toEqual(["direct"]);
  });

  it.each(["do-connecting-ip", "true-client-ip", "fly-client-ip", "x-real-ip", "x-forwarded-for"])(
    "ignores a forged %s",
    (name) => {
      expect(getClientIp(headers({ [name]: "203.0.113.9" }))).toBe("direct");
    },
  );

  it("treats an empty or blank TRUSTED_CLIENT_IP_HEADER as unset, without a warning about its value", () => {
    env.TRUSTED_CLIENT_IP_HEADER = "   ";
    expect(getClientIp(headers({ "cf-connecting-ip": "203.0.113.9" }))).toBe("direct");
    expect(warnings()).toEqual([]);
  });
});

describe("getClientIp: TRUSTED_CLIENT_IP_HEADER", () => {
  it("trusts exactly the named header, and a forged cf-connecting-ip is ignored", () => {
    env.TRUSTED_CLIENT_IP_HEADER = "do-connecting-ip";
    expect(
      getClientIp(headers({ "do-connecting-ip": "198.51.100.7", "cf-connecting-ip": "203.0.113.9" })),
    ).toBe("198.51.100.7");
    expect(getClientIp(headers({ "cf-connecting-ip": "203.0.113.9" }))).toBe("direct");
  });

  it("trusts cf-connecting-ip when that is the configured header", () => {
    env.TRUSTED_CLIENT_IP_HEADER = "cf-connecting-ip";
    expect(getClientIp(headers({ "cf-connecting-ip": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  it.each(["do-connecting-ip", "cf-connecting-ip", "true-client-ip", "fly-client-ip", "x-real-ip"])(
    "accepts %s from the allow-list",
    (name) => {
      env.TRUSTED_CLIENT_IP_HEADER = name;
      expect(getClientIp(headers({ [name]: "192.0.2.44" }))).toBe("192.0.2.44");
      expect(warnings()).toEqual([]);
    },
  );

  it("compares the name case-insensitively and ignores surrounding whitespace", () => {
    env.TRUSTED_CLIENT_IP_HEADER = "  DO-Connecting-IP ";
    expect(getClientIp(headers({ "do-connecting-ip": "198.51.100.7" }))).toBe("198.51.100.7");
    expect(warnings()).toEqual([]);
  });

  it("accepts an IPv6 address", () => {
    env.TRUSTED_CLIENT_IP_HEADER = "do-connecting-ip";
    expect(getClientIp(headers({ "do-connecting-ip": "2001:db8::1" }))).toBe("2001:db8::1");
  });

  it.each(["999.1.1.1", "not-an-ip", "2001:db8::1::2", "198.51.100.7, 203.0.113.9", "198.51.100.7:443", ""])(
    "falls through to \"direct\" when the trusted header holds %j",
    (value) => {
      env.TRUSTED_CLIENT_IP_HEADER = "do-connecting-ip";
      expect(getClientIp(headers({ "do-connecting-ip": value, "cf-connecting-ip": "203.0.113.9" }))).toBe("direct");
    },
  );

  it("falls through to TRUSTED_PROXY_HOPS when the trusted header is missing or invalid", () => {
    env.TRUSTED_CLIENT_IP_HEADER = "do-connecting-ip";
    env.TRUSTED_PROXY_HOPS = "1";
    expect(getClientIp(headers({ "x-forwarded-for": "198.51.100.1, 203.0.113.12" }))).toBe("203.0.113.12");
    expect(
      getClientIp(headers({ "do-connecting-ip": "oops", "x-forwarded-for": "198.51.100.1, 203.0.113.12" })),
    ).toBe("203.0.113.12");
  });

  it("ignores an unknown header name and warns once, naming the bad value", () => {
    env.TRUSTED_CLIENT_IP_HEADER = "x-my-secret-header";
    for (let i = 0; i < 5; i++) {
      expect(getClientIp(headers({ "x-my-secret-header": "203.0.113.9", "cf-connecting-ip": "203.0.113.10" }))).toBe(
        "direct",
      );
    }
    expect(warnings()).toHaveLength(1);
    expect(warnings()[0]).toContain("x-my-secret-header");
    expect(warnings()[0]).toContain("TRUSTED_CLIENT_IP_HEADER");
  });

  it("refuses x-forwarded-for as a trusted header (that is what TRUSTED_PROXY_HOPS is for)", () => {
    env.TRUSTED_CLIENT_IP_HEADER = "x-forwarded-for";
    expect(getClientIp(headers({ "x-forwarded-for": "203.0.113.9" }))).toBe("direct");
    expect(warnings()).toHaveLength(1);
    expect(warnings()[0]).toContain("x-forwarded-for");
  });

  it("warns again for a different bad value, but never twice for the same one", () => {
    env.TRUSTED_CLIENT_IP_HEADER = "bogus-one";
    getClientIp(headers({}));
    getClientIp(headers({}));
    env.TRUSTED_CLIENT_IP_HEADER = "bogus-two";
    getClientIp(headers({}));
    getClientIp(headers({}));
    expect(warnings()).toHaveLength(2);
    expect(warnings()[0]).toContain("bogus-one");
    expect(warnings()[1]).toContain("bogus-two");
  });
});

describe("getClientIp: precedence (Vercel, then TRUSTED_CLIENT_IP_HEADER, then TRUSTED_PROXY_HOPS, then \"direct\")", () => {
  const all = {
    "x-vercel-forwarded-for": "192.0.2.1",
    "do-connecting-ip": "192.0.2.2",
    "x-forwarded-for": "198.51.100.1, 192.0.2.3",
  };

  beforeEach(() => {
    env.TRUSTED_CLIENT_IP_HEADER = "do-connecting-ip";
    env.TRUSTED_PROXY_HOPS = "1";
  });

  it("Vercel wins when VERCEL=1", () => {
    env.VERCEL = "1";
    expect(getClientIp(headers(all))).toBe("192.0.2.1");
  });

  it("x-vercel-forwarded-for is ignored unless VERCEL=1", () => {
    expect(getClientIp(headers(all))).toBe("192.0.2.2");
  });

  it("on Vercel, an invalid x-vercel-forwarded-for falls through to the trusted header", () => {
    env.VERCEL = "1";
    expect(getClientIp(headers({ ...all, "x-vercel-forwarded-for": "garbage" }))).toBe("192.0.2.2");
  });

  it("the trusted header beats TRUSTED_PROXY_HOPS", () => {
    expect(getClientIp(headers({ "do-connecting-ip": "192.0.2.2", "x-forwarded-for": "198.51.100.1, 192.0.2.3" }))).toBe(
      "192.0.2.2",
    );
  });

  it("TRUSTED_PROXY_HOPS is used when the trusted header is absent", () => {
    expect(getClientIp(headers({ "x-forwarded-for": "198.51.100.1, 192.0.2.3" }))).toBe("192.0.2.3");
  });

  it("\"direct\" when nothing resolves", () => {
    env.VERCEL = "1";
    expect(getClientIp(headers({}))).toBe("direct");
  });

  it("keeps the Vercel branch working as before when it is the only setting", () => {
    delete env.TRUSTED_CLIENT_IP_HEADER;
    delete env.TRUSTED_PROXY_HOPS;
    env.VERCEL = "1";
    expect(getClientIp(headers({ "x-vercel-forwarded-for": "192.0.2.1, 10.0.0.1" }))).toBe("192.0.2.1");
  });

  it("keeps the TRUSTED_PROXY_HOPS branch working as before when it is the only setting", () => {
    delete env.TRUSTED_CLIENT_IP_HEADER;
    env.TRUSTED_PROXY_HOPS = "2";
    expect(getClientIp(headers({ "x-forwarded-for": "198.51.100.1, 192.0.2.3, 10.0.0.1" }))).toBe("192.0.2.3");
    expect(getClientIp(headers({ "x-real-ip": "192.0.2.50" }))).toBe("192.0.2.50");
  });
});

/**
 * An unconfigured production deployment is reported as an ERROR through the repo logger, once per process, at
 * start-up (instrumentation.ts; instrumentationClientIp.test.ts), and on Admin > System health, from
 * clientIpConfigurationProblem() / clientIpHealth(). getClientIp itself no longer writes to the console per process.
 */
describe("the client-IP configuration problem (production only)", () => {
  beforeEach(() => {
    env.NODE_ENV = "production";
  });

  it("names the problem and the fix when nothing is configured: every client shares the \"direct\" buckets", () => {
    const problem = clientIpConfigurationProblem();
    expect(problem).toContain("\"direct\"");
    expect(problem).toContain("TRUSTED_CLIENT_IP_HEADER");
    expect(problem).toContain("do-connecting-ip");
    expect(clientIpHealth()).toEqual({ status: "critical", source: "none" });
  });

  it("getClientIp no longer warns on the console about it, however many requests", () => {
    for (let i = 0; i < 25; i++) getClientIp(headers({ "cf-connecting-ip": `198.51.100.${i + 1}` }));
    expect(warnings()).toEqual([]);
  });

  it.each(["test", "development"])("is no problem in %s", (nodeEnv) => {
    env.NODE_ENV = nodeEnv;
    expect(clientIpConfigurationProblem()).toBeNull();
    expect(clientIpHealth()).toEqual({ status: "healthy", source: "none" });
  });

  it("is no problem when TRUSTED_CLIENT_IP_HEADER is set", () => {
    env.TRUSTED_CLIENT_IP_HEADER = "do-connecting-ip";
    expect(clientIpConfigurationProblem()).toBeNull();
    expect(clientIpHealth()).toEqual({ status: "healthy", source: "header", header: "do-connecting-ip" });
  });

  it("is no problem when TRUSTED_PROXY_HOPS is set", () => {
    env.TRUSTED_PROXY_HOPS = "1";
    expect(clientIpConfigurationProblem()).toBeNull();
    expect(clientIpHealth()).toEqual({ status: "healthy", source: "proxy-hops", hops: 1 });
  });

  it("is no problem on Vercel", () => {
    env.VERCEL = "1";
    expect(clientIpConfigurationProblem()).toBeNull();
    expect(clientIpHealth()).toEqual({ status: "healthy", source: "vercel" });
  });

  it("an unusable TRUSTED_CLIENT_IP_HEADER still counts as not configured (and its own console warning stays, once)", () => {
    env.TRUSTED_CLIENT_IP_HEADER = "bogus";
    for (let i = 0; i < 5; i++) getClientIp(headers({}));
    expect(warnings()).toHaveLength(1);
    expect(warnings()[0]).toContain("bogus");
    expect(clientIpConfigurationProblem()).toContain("TRUSTED_CLIENT_IP_HEADER");
  });

  it("a non-positive or non-numeric TRUSTED_PROXY_HOPS is not a configuration", () => {
    for (const hops of ["0", "-1", "two"]) {
      env.TRUSTED_PROXY_HOPS = hops;
      expect(clientIpConfigurationProblem()).not.toBeNull();
    }
  });
});

describe("withTrustedClientIp", () => {
  it("rewrites x-forwarded-for to the resolved address and drops x-real-ip and x-vercel-forwarded-for", () => {
    env.TRUSTED_CLIENT_IP_HEADER = "do-connecting-ip";
    const out = withTrustedClientIp(
      headers({
        "do-connecting-ip": "198.51.100.7",
        "x-forwarded-for": "203.0.113.50, 10.0.0.1",
        "x-real-ip": "203.0.113.51",
        "x-vercel-forwarded-for": "203.0.113.52",
        "user-agent": "jest",
      }),
    );
    expect(out.get("x-forwarded-for")).toBe("198.51.100.7");
    expect(out.has("x-real-ip")).toBe(false);
    expect(out.has("x-vercel-forwarded-for")).toBe(false);
    expect(out.get("user-agent")).toBe("jest");
  });

  it("with nothing configured: x-forwarded-for becomes \"direct\" and no forged client-IP header survives", () => {
    const out = withTrustedClientIp(
      headers({
        "cf-connecting-ip": "203.0.113.9",
        "do-connecting-ip": "203.0.113.10",
        "true-client-ip": "203.0.113.11",
        "fly-client-ip": "203.0.113.12",
        "x-real-ip": "203.0.113.13",
        "x-forwarded-for": "203.0.113.14",
      }),
    );
    expect(out.get("x-forwarded-for")).toBe("direct");
    for (const name of ["cf-connecting-ip", "do-connecting-ip", "true-client-ip", "fly-client-ip", "x-real-ip"]) {
      expect(out.has(name)).toBe(false);
    }
  });

  it("strips the untrusted client-IP headers but keeps the configured one, so route handlers still resolve the same address", () => {
    env.TRUSTED_CLIENT_IP_HEADER = "do-connecting-ip";
    const out = withTrustedClientIp(
      headers({ "do-connecting-ip": "198.51.100.7", "cf-connecting-ip": "203.0.113.9", "true-client-ip": "203.0.113.11" }),
    );
    expect(out.get("do-connecting-ip")).toBe("198.51.100.7");
    expect(out.has("cf-connecting-ip")).toBe(false);
    expect(out.has("true-client-ip")).toBe(false);
  });

  it("keeps x-real-ip, carrying the resolved address, when x-real-ip is the configured header", () => {
    env.TRUSTED_CLIENT_IP_HEADER = "x-real-ip";
    const out = withTrustedClientIp(headers({ "x-real-ip": "198.51.100.7" }));
    expect(out.get("x-real-ip")).toBe("198.51.100.7");
    expect(out.get("x-forwarded-for")).toBe("198.51.100.7");
  });

  it("removes junk from the configured header when nothing valid resolved", () => {
    env.TRUSTED_CLIENT_IP_HEADER = "do-connecting-ip";
    const out = withTrustedClientIp(headers({ "do-connecting-ip": "not-an-ip" }));
    expect(out.get("x-forwarded-for")).toBe("direct");
    expect(out.has("do-connecting-ip")).toBe(false);
  });

  it("on Vercel it writes the resolved address back into x-vercel-forwarded-for, so route handlers still resolve it", () => {
    env.VERCEL = "1";
    const out = withTrustedClientIp(
      headers({ "x-vercel-forwarded-for": "192.0.2.1, 10.0.0.1", "x-forwarded-for": "203.0.113.50" }),
    );
    expect(out.get("x-vercel-forwarded-for")).toBe("192.0.2.1");
    expect(out.get("x-forwarded-for")).toBe("192.0.2.1");
  });

  it("on Vercel with no valid x-vercel-forwarded-for it leaves that header out rather than writing \"direct\"", () => {
    env.VERCEL = "1";
    const out = withTrustedClientIp(headers({ "x-vercel-forwarded-for": "not-an-ip" }));
    expect(out.has("x-vercel-forwarded-for")).toBe(false);
    expect(out.get("x-forwarded-for")).toBe("direct");
  });

  it("off Vercel, a caller-supplied x-vercel-forwarded-for is dropped and not recreated", () => {
    env.TRUSTED_CLIENT_IP_HEADER = "do-connecting-ip";
    const out = withTrustedClientIp(
      headers({ "do-connecting-ip": "198.51.100.7", "x-vercel-forwarded-for": "203.0.113.52" }),
    );
    expect(out.has("x-vercel-forwarded-for")).toBe(false);
  });

  it("does not modify the headers it was given", () => {
    env.TRUSTED_CLIENT_IP_HEADER = "do-connecting-ip";
    const input = headers({ "do-connecting-ip": "198.51.100.7", "cf-connecting-ip": "203.0.113.9", "x-real-ip": "203.0.113.51" });
    withTrustedClientIp(input);
    expect(input.get("cf-connecting-ip")).toBe("203.0.113.9");
    expect(input.get("x-real-ip")).toBe("203.0.113.51");
    expect(input.has("x-forwarded-for")).toBe(false);
  });

  describe("route handlers see the proxy's headers: getClientIp(withTrustedClientIp(h)) === getClientIp(h)", () => {
    const cases: Array<[string, Record<string, string | undefined>, Record<string, string>]> = [
      ["nothing configured", {}, { "cf-connecting-ip": "203.0.113.9", "x-forwarded-for": "203.0.113.50" }],
      ["do-connecting-ip", { TRUSTED_CLIENT_IP_HEADER: "do-connecting-ip" }, { "do-connecting-ip": "198.51.100.7", "cf-connecting-ip": "203.0.113.9" }],
      ["do-connecting-ip, header missing", { TRUSTED_CLIENT_IP_HEADER: "do-connecting-ip" }, { "cf-connecting-ip": "203.0.113.9" }],
      ["cf-connecting-ip", { TRUSTED_CLIENT_IP_HEADER: "cf-connecting-ip" }, { "cf-connecting-ip": "203.0.113.9" }],
      ["x-real-ip", { TRUSTED_CLIENT_IP_HEADER: "x-real-ip" }, { "x-real-ip": "203.0.113.9" }],
      ["IPv6", { TRUSTED_CLIENT_IP_HEADER: "do-connecting-ip" }, { "do-connecting-ip": "2001:db8::1" }],
      ["proxy hops only", { TRUSTED_PROXY_HOPS: "2" }, { "x-forwarded-for": "198.51.100.1, 192.0.2.3, 10.0.0.1" }],
      [
        "trusted header resolved by hops",
        { TRUSTED_CLIENT_IP_HEADER: "do-connecting-ip", TRUSTED_PROXY_HOPS: "1" },
        { "x-forwarded-for": "198.51.100.1, 192.0.2.3" },
      ],
      [
        "Vercel plus trusted header",
        { VERCEL: "1", TRUSTED_CLIENT_IP_HEADER: "do-connecting-ip" },
        { "x-vercel-forwarded-for": "192.0.2.1", "do-connecting-ip": "192.0.2.2" },
      ],
      [
        "Vercel only",
        { VERCEL: "1" },
        { "x-vercel-forwarded-for": "192.0.2.1", "x-forwarded-for": "203.0.113.50", "cf-connecting-ip": "203.0.113.9" },
      ],
      ["Vercel only, IPv6", { VERCEL: "1" }, { "x-vercel-forwarded-for": "2001:db8::7" }],
      ["Vercel only, header missing", { VERCEL: "1" }, { "x-forwarded-for": "203.0.113.50" }],
    ];

    it.each(cases)("%s", (_label, config, incoming) => {
      for (const [key, value] of Object.entries(config)) env[key] = value;
      const forwarded = withTrustedClientIp(headers(incoming));
      expect(getClientIp(forwarded)).toBe(getClientIp(headers(incoming)));
    });
  });
});
