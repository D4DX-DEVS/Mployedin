/**
 * @jest-environment node
 *
 * Candidates respond to an interview through an authenticated dashboard route,
 * which is why RSVP-from-the-email is attractive — and why it must not be done
 * with mail-client RSVP buttons: those send an iTIP reply to the organiser
 * mailbox, and this app has no inbound mail processing, so the reply would be
 * lost while the candidate believed they had answered.
 *
 * Instead the invite carries a secret-token URL, the same shape as the
 * calendar feed already uses, which drives the real `candidateResponse`.
 */
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));

jest.mock("@/models/Interview", () => ({
  __esModule: true,
  default: { findById: jest.fn(), updateOne: jest.fn(async () => ({ modifiedCount: 1 })) },
}));

import {
  RESPONSE_TOKEN_RE,
  ensureResponseToken,
  generateResponseToken,
  responseUrl,
} from "@/lib/interviews/responseToken";

function chain<T>(result: T) {
  const c: Record<string, jest.Mock> = {};
  c.select = jest.fn(() => c);
  c.lean = jest.fn(async () => result);
  return c;
}

describe("generateResponseToken", () => {
  it("produces a long, URL-safe token", () => {
    const t = generateResponseToken();
    expect(t).toMatch(RESPONSE_TOKEN_RE);
    expect(t.length).toBeGreaterThanOrEqual(32);
  });

  it("does not repeat", () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateResponseToken()));
    expect(seen.size).toBe(200);
  });
});

describe("RESPONSE_TOKEN_RE", () => {
  it("rejects anything that is not a plain base64url token", () => {
    expect(RESPONSE_TOKEN_RE.test("short")).toBe(false);
    expect(RESPONSE_TOKEN_RE.test("has spaces in it here padded out to length")).toBe(false);
    expect(RESPONSE_TOKEN_RE.test("../../etc/passwd-aaaaaaaaaaaaaaaaaaaaaaaaa")).toBe(false);
    expect(RESPONSE_TOKEN_RE.test("a".repeat(200))).toBe(false);
  });
});

describe("responseUrl", () => {
  it("points at the public page, not the API", () => {
    const url = responseUrl("TOKEN123", "https://app.example.com", "en");
    expect(url).toBe("https://app.example.com/en/interview-response/TOKEN123");
  });

  it("keeps the reader in their own locale", () => {
    expect(responseUrl("T", "https://a.co", "ar")).toContain("/ar/");
  });

  it("tolerates a base url with a trailing slash", () => {
    expect(responseUrl("T", "https://a.co/", "en")).toBe("https://a.co/en/interview-response/T");
  });
});

describe("ensureResponseToken", () => {
  let Interview: { findById: jest.Mock; updateOne: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();
    Interview = (await import("@/models/Interview")).default as never;
  });

  it("returns the token already on the interview without writing", async () => {
    Interview.findById.mockReturnValue(chain({ responseToken: "existing-token-aaaaaaaaaaaaaaaaaaaa" }));
    await expect(ensureResponseToken("iv_1")).resolves.toBe("existing-token-aaaaaaaaaaaaaaaaaaaa");
    expect(Interview.updateOne).not.toHaveBeenCalled();
  });

  it("mints and persists one for an interview created before the field existed", async () => {
    Interview.findById.mockReturnValue(chain({}));
    const token = await ensureResponseToken("iv_2");
    expect(token).toMatch(RESPONSE_TOKEN_RE);
    expect(Interview.updateOne).toHaveBeenCalledWith(
      { _id: "iv_2" },
      { $set: { responseToken: token } },
    );
  });

  it("returns null when the interview is gone", async () => {
    Interview.findById.mockReturnValue(chain(null));
    await expect(ensureResponseToken("missing")).resolves.toBeNull();
    expect(Interview.updateOne).not.toHaveBeenCalled();
  });
});
