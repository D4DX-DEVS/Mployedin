/**
 * @jest-environment node
 */
import {
  hiringRangeFor, normalizeLeadExtraction, openPosterToken, rolesSummary, sealPosterToken,
} from "@/lib/leads/posterExtract";

beforeAll(() => {
  process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? "a".repeat(64);
});

describe("normalizeLeadExtraction", () => {
  it("maps a hiring poster to the lead form's values", () => {
    const out = normalizeLeadExtraction({
      companyName: "  Al Noor Hotels ",
      contactPerson: "HR Manager",
      contactEmail: "Jobs@AlNoor.ae",
      contactPhone: "+971 50 123 4567",
      website: "alnoor.ae",
      country: "United Arab Emirates",
      city: "Dubai",
      industry: "Hospitality",
      roles: [{ title: "Waiter", count: 10 }, { title: "Chef", count: 2 }, { title: "waiter", count: 2 }],
      applyDetails: "Walk-in interview 12 Nov",
      unsure: ["city"],
    });
    expect(out).not.toBeNull();
    expect(out!.values).toMatchObject({
      companyName: "Al Noor Hotels",
      contactPerson: "HR Manager",
      contactEmail: "jobs@alnoor.ae",
      contactPhone: "+971 50 123 4567",
      city: "Dubai",
      expectedHiring: "11-25",
      requirement: "Waiter ×12, Chef ×2",
      source: "Hiring poster",
    });
    expect(out!.values.notes).toContain("Walk-in interview");
    expect(out!.roles).toEqual([{ title: "Waiter", count: 12 }, { title: "Chef", count: 2 }]);
    expect(out!.unsure).toEqual(["city"]);
  });

  it("drops malformed contact details and asks the agent to check them", () => {
    const out = normalizeLeadExtraction({
      companyName: "Acme",
      contactPerson: "",
      contactEmail: "not an email",
      contactPhone: "0501234567",
      roles: ["Driver"],
    });
    expect(out!.values.contactEmail).toBe("");
    expect(out!.values.contactPhone).toBe("0501234567");
    expect(out!.unsure).toEqual(expect.arrayContaining(["contactEmail", "contactPhone", "contactPerson"]));
    expect(out!.roles).toEqual([{ title: "Driver", count: 1 }]);
  });

  it("returns null for something that is not a hiring poster", () => {
    expect(normalizeLeadExtraction({ companyName: "", roles: [] })).toBeNull();
    expect(normalizeLeadExtraction("nonsense")).toBeNull();
  });

  it("bands hiring size and keeps the summary inside the lead's limit", () => {
    expect(hiringRangeFor(0)).toBe("");
    expect(hiringRangeFor(5)).toBe("1-5");
    expect(hiringRangeFor(51)).toBe("50+");
    const many = Array.from({ length: 30 }, (_, i) => ({ title: `Role number ${i} with a long title`, count: 1 }));
    expect(rolesSummary(many).length).toBeLessThanOrEqual(500);
  });
});

describe("country and dial code", () => {
  it("dials the poster's country when the number has no code", () => {
    const india = normalizeLeadExtraction({ companyName: "Kochi Foods", country: "India", countryCode: "IN", contactPhone: "98470 12345", roles: ["Cook"] });
    expect(india!.values.contactPhone).toBe("+91 98470 12345");
    expect(india!.unsure).not.toContain("contactPhone");

    const uae = normalizeLeadExtraction({ companyName: "Gulf Build", country: "UAE", contactPhone: "050 123 4567", roles: ["Mason"] });
    expect(uae!.values.contactPhone).toBe("+971 50 123 4567");
  });

  it("keeps a number's own code and fills a missing country from it", () => {
    const out = normalizeLeadExtraction({ companyName: "Doha Retail", contactPhone: "+974 3312 3456", roles: ["Cashier"] });
    expect(out!.values.contactPhone).toBe("+974 3312 3456");
    expect(out!.values.country).toBe("Qatar");
    expect(out!.unsure).toContain("country");
  });

  it("flags a number it cannot place", () => {
    const out = normalizeLeadExtraction({ companyName: "Acme", contactPhone: "12345", roles: ["Driver"] });
    expect(out!.unsure).toContain("contactPhone");
  });
});

describe("poster token", () => {
  const file = { key: "documents/private/abc.png", name: "poster.png", mimeType: "image/png", size: 1234 };

  it("opens for the same agent within a day", () => {
    const token = sealPosterToken(file, "user-1", 1_000);
    expect(openPosterToken(token, "user-1", 2_000)).toEqual(file);
  });

  it("refuses another user, an expired token and a forged one", () => {
    const token = sealPosterToken(file, "user-1", 1_000);
    expect(openPosterToken(token, "user-2", 2_000)).toBeNull();
    expect(openPosterToken(token, "user-1", 1_000 + 25 * 60 * 60 * 1000)).toBeNull();
    expect(openPosterToken("Zm9yZ2Vk", "user-1")).toBeNull();
  });
});
