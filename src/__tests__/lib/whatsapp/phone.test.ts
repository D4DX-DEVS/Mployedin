import { toWaRecipient, fromWaId } from "@/lib/communications/whatsapp/phone";

describe("toWaRecipient", () => {
  it("strips the plus and formatting from a stored E.164 number", () => {
    expect(toWaRecipient("+971 50 123 4567")).toBe("971501234567");
    expect(toWaRecipient("+14155552671")).toBe("14155552671");
  });
  it("accepts a legacy number stored without a plus", () => {
    expect(toWaRecipient("971501234567")).toBe("971501234567");
  });
  it("rejects local, empty and nonsense values", () => {
    expect(toWaRecipient("0501234567")).toBeNull();
    expect(toWaRecipient("")).toBeNull();
    expect(toWaRecipient(undefined)).toBeNull();
    expect(toWaRecipient("+12345")).toBeNull();
  });
});

describe("fromWaId", () => {
  it("restores the E.164 form used on User.phone", () => {
    expect(fromWaId("971501234567")).toBe("+971501234567");
  });
});
