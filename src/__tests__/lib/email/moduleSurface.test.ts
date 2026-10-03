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
});
