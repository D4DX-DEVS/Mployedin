/**
 * @jest-environment node
 */
/** Linked invoice lines carry their hire (name, job, start date) to the view and PDF. Mocks only. */
const lean = (v: unknown) => ({ select: () => ({ lean: async () => v }) });
jest.mock("@/models/Placement", () => ({
  __esModule: true,
  default: { find: jest.fn(() => lean([{ _id: "p1", jobId: "j1", jobSeekerId: "s1", startDate: new Date("2026-12-01") }])) },
}));
jest.mock("@/models/JobSeeker", () => ({ __esModule: true, default: { find: jest.fn(() => lean([{ _id: "s1", userId: "u1", fullName: "" }])) } }));
jest.mock("@/models/User", () => ({ __esModule: true, default: { find: jest.fn(() => lean([{ _id: "u1", name: "Asha Nair" }])) } }));
jest.mock("@/models/Job", () => ({ __esModule: true, default: { find: jest.fn(() => lean([{ _id: "j1", title: "Nurse" }])) } }));

import { attachLineHires } from "@/lib/invoices/lineHires";
import { hireLine } from "@/lib/invoices/pdfLabels";
import { resolveLineItems } from "@/lib/invoices/presentation";
import Placement from "@/models/Placement";

describe("invoice line hires", () => {
  it("adds the hire to linked lines only, falling back to the account name", async () => {
    const out = await attachLineHires({
      lineItems: [
        { description: "Placement fee", amount: 100, placementId: "p1" },
        { description: "Admin fee", amount: 10 },
      ],
    });
    const lines = out.lineItems as { hire?: unknown }[];
    expect(lines[0].hire).toEqual({ candidateName: "Asha Nair", jobTitle: "Nurse", startDate: new Date("2026-12-01") });
    expect(lines[1].hire).toBeUndefined();
    expect(resolveLineItems(out)[0].hire?.jobTitle).toBe("Nurse");
  });

  it("does not query when no line is linked", async () => {
    (Placement.find as jest.Mock).mockClear();
    const invoice = { lineItems: [{ description: "Fee", amount: 1 }] };
    expect(await attachLineHires(invoice)).toBe(invoice);
    expect(Placement.find).not.toHaveBeenCalled();
  });

  it("prints a hire line on the PDF", () => {
    expect(hireLine({ candidateName: "Asha Nair", jobTitle: "Nurse", startDate: "2026-12-01" })).toBe("Hire: Asha Nair · Nurse · Starts 01 Dec 2026");
    expect(hireLine({})).toBeNull();
    expect(hireLine(undefined)).toBeNull();
  });
});
