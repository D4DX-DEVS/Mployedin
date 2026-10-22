/**
 * @jest-environment node
 */
import { RECEIPT_ID_PATTERN, isReceiptId } from "@/lib/consent/receiptId";

const UUID = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";

describe("isReceiptId", () => {
  it("accepts an RFC 4122 shaped id, either case", () => {
    expect(isReceiptId(UUID)).toBe(true);
    expect(isReceiptId(UUID.toUpperCase())).toBe(true);
    expect(RECEIPT_ID_PATTERN.test(UUID)).toBe(true);
  });

  it.each([
    ["not a string", 42],
    ["undefined", undefined],
    ["empty", ""],
    ["a word", "not-a-uuid"],
    ["too long", `${UUID}-extra`],
    ["with a space around it", ` ${UUID} `],
    ["with a trailing newline", `${UUID}\n`],
    ["with a non-hex character", UUID.replace("1b9d", "zb9d")],
    ["a Mongo operator", "$ne"],
  ])("rejects %s", (_label, value) => {
    expect(isReceiptId(value)).toBe(false);
  });
});
