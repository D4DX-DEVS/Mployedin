import { redactSecrets, scrubError, summarizeError } from "@/lib/communications/whatsapp/redact";

const ENV_KEYS = ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_APP_SECRET", "WHATSAPP_WEBHOOK_VERIFY_TOKEN"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
});
afterEach(() => {
  for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
});

describe("redactSecrets", () => {
  it("leaves an ordinary Graph message alone", () => {
    expect(redactSecrets("(#132001) Template name does not exist")).toBe("(#132001) Template name does not exist");
    expect(redactSecrets("Invalid OAuth access token - Cannot parse access token")).toBe("Invalid OAuth access token - Cannot parse access token");
  });
  it("blanks a bearer token a fetch TypeError echoed, including one with a space or control character inside", () => {
    expect(redactSecrets('Headers.append: "Bearer EAABsecret123token" is an invalid header value.')).toBe('Headers.append: "Bearer [redacted]" is an invalid header value.');
    expect(redactSecrets('Headers.append: "Bearer EAAB\u0000secret" is an invalid header value.')).toBe('Headers.append: "Bearer [redacted]" is an invalid header value.');
    expect(redactSecrets('Headers.append: "bearer EAAB\nsecret" is an invalid header value.')).not.toMatch(/secret/);
  });
  it("blanks everything after Bearer when there is no closing quote, since the end of a token cannot be told", () => {
    expect(redactSecrets("Request failed: Bearer EAABsecret123token")).toBe("Request failed: Bearer [redacted]");
    const out = redactSecrets("Request failed: Bearer EAAB secret123 and then some more text");
    expect(out).toBe("Request failed: Bearer [redacted]");
    expect(out).not.toMatch(/secret123/);
  });
  it("blanks a single-quoted bearer token up to its closing quote", () => {
    expect(redactSecrets("bad header 'Bearer EAABsecret123token' rejected")).toBe("bad header 'Bearer [redacted]' rejected");
  });
  it("blanks the configured secrets wherever they appear", () => {
    process.env.WHATSAPP_ACCESS_TOKEN = "EAABlongtokenvalue";
    process.env.WHATSAPP_APP_SECRET = "appsecretvalue";
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = "verify-token-value";
    const out = redactSecrets("bad EAABlongtokenvalue, appsecretvalue and verify-token-value; EAABlongtokenvalue again");
    expect(out).toBe("bad [redacted], [redacted] and [redacted]; [redacted] again");
  });
  it("does not blank a configured value too short to be a real secret", () => {
    process.env.WHATSAPP_APP_SECRET = "abc";
    expect(redactSecrets("abc is a letter run")).toBe("abc is a letter run");
  });
  it("handles an empty message", () => {
    expect(redactSecrets("")).toBe("");
  });
});

describe("summarizeError", () => {
  it("reads name, scrubbed message and the system code from the cause", () => {
    const cause = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
    expect(summarizeError(new TypeError("fetch failed", { cause }))).toEqual({ name: "TypeError", message: "fetch failed", causeCode: "ECONNREFUSED" });
  });
  it("falls back to the error's own code, then to none", () => {
    expect(summarizeError(Object.assign(new Error("x"), { code: "ETIMEDOUT" })).causeCode).toBe("ETIMEDOUT");
    expect(summarizeError(new Error("x")).causeCode).toBeUndefined();
    expect(summarizeError(Object.assign(new Error("x"), { code: 190 })).causeCode).toBeUndefined();
  });
  it("scrubs the message and the code", () => {
    const out = summarizeError(new TypeError('Headers.append: "Bearer EAABsecret123token" is an invalid header value.'));
    expect(out.message).not.toMatch(/EAABsecret123token/);
    process.env.WHATSAPP_ACCESS_TOKEN = "EAABlongsecretvalue";
    expect(summarizeError({ message: "x", cause: { code: "EAABlongsecretvalue" } }).causeCode).toBe("[redacted]");
  });
  it("reads a look-alike from another realm, which fails instanceof Error", () => {
    expect(summarizeError({ name: "TimeoutError", message: "The operation was aborted due to timeout" })).toEqual({ name: "TimeoutError", message: "The operation was aborted due to timeout", causeCode: undefined });
  });
  it("handles strings, null and objects without a message", () => {
    expect(summarizeError("boom Bearer EAABsecret123token")).toEqual({ name: "Error", message: "boom Bearer [redacted]", causeCode: undefined });
    expect(summarizeError(null).message).toBe("null");
    expect(summarizeError({}).name).toBe("Error");
  });
});

describe("scrubError", () => {
  it("builds a new Error with the same name, the scrubbed message and only { code } as cause", () => {
    const cause = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
    const original = Object.assign(new TypeError('bad "Bearer EAABsecret123token"', { cause }), { name: "TypeError" });
    const out = scrubError(original);
    expect(out).not.toBe(original);
    expect(out).toBeInstanceOf(Error);
    expect(out.name).toBe("TypeError");
    expect(out.message).toBe('bad "Bearer [redacted]"');
    expect(out.cause).toEqual({ code: "ECONNREFUSED" });
    expect(JSON.stringify({ m: out.message, s: out.stack, c: out.cause })).not.toContain("EAABsecret123token");
  });
  it("sets no cause when there is no code", () => {
    expect(scrubError(new Error("x")).cause).toBeUndefined();
  });
});
