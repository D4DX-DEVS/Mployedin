/**
 * @jest-environment node
 */
jest.mock("@/models/EmailLog", () => ({ __esModule: true, logEmailDelivery: jest.fn(), default: {} }));

describe("@/lib/communications/email surface after the folder split", () => {
  it("re-exports the three public names from the folder index", async () => {
    const mod = await import("@/lib/communications/email");
    expect(typeof mod.sendEmail).toBe("function");
    expect(typeof mod.isUndeliverableAddress).toBe("function");
    expect(typeof mod.EmailTemplates).toBe("object");
    expect(typeof mod.EmailTemplates.verifyEmail).toBe("function");
  });

  it("keeps the reserved-domain rule", async () => {
    const { isUndeliverableAddress } = await import("@/lib/communications/email/send");
    expect(isUndeliverableAddress("qa@seed.example")).toBe(true);
    expect(isUndeliverableAddress("seed@test.mployedin.com")).toBe(true);
    expect(isUndeliverableAddress("person@gmail.com")).toBe(false);
  });

  // 2026-10-06: a QA sign-up at @example.com really sent its verification and
  // welcome mail — the rule matched only the .example TLD, not RFC 2606's
  // reserved second-level names.
  it("treats example.com, .net and .org as reserved, but not look-alikes", async () => {
    const { isUndeliverableAddress } = await import("@/lib/communications/email/send");
    expect(isUndeliverableAddress("qa@example.com")).toBe(true);
    expect(isUndeliverableAddress("qa@EXAMPLE.NET")).toBe(true);
    expect(isUndeliverableAddress("qa@example.org")).toBe(true);
    expect(isUndeliverableAddress("qa@mail.example.com")).toBe(true);
    expect(isUndeliverableAddress("qa@myexample.com")).toBe(false);
    expect(isUndeliverableAddress("qa@example.com.au")).toBe(false);
    expect(isUndeliverableAddress("qa@example.co")).toBe(false);
  });
});
