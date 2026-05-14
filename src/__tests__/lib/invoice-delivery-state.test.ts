/**
 * @jest-environment node
 */

import { getInvoiceDeliveryState } from "@/lib/invoices/status";

describe("getInvoiceDeliveryState", () => {
  it("returns not_sent before delivery starts", () => {
    expect(getInvoiceDeliveryState({})).toBe("not_sent");
  });

  it("returns sent after the invoice is sent", () => {
    expect(getInvoiceDeliveryState({ sentAt: new Date("2026-05-10T09:00:00.000Z") })).toBe("sent");
  });

  it("returns viewed after the employer opens the invoice", () => {
    expect(getInvoiceDeliveryState({
      sentAt: new Date("2026-05-10T09:00:00.000Z"),
      viewedAt: new Date("2026-05-11T09:00:00.000Z"),
    })).toBe("viewed");
  });

  it("returns downloaded as the most complete employer delivery state", () => {
    expect(getInvoiceDeliveryState({
      sentAt: new Date("2026-05-10T09:00:00.000Z"),
      viewedAt: new Date("2026-05-11T09:00:00.000Z"),
      downloadedAt: new Date("2026-05-12T09:00:00.000Z"),
    })).toBe("downloaded");
  });
});