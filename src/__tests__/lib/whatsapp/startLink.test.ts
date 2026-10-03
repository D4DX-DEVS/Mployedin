/**
 * @jest-environment node
 */
export {};

let live = true;
jest.mock("@/lib/communications/whatsapp/config", () => ({ isWhatsAppEnabled: () => live }));
const getPhoneNumberInfo = jest.fn();
jest.mock("@/lib/communications/whatsapp/cloudApi", () => ({ getPhoneNumberInfo: (...a: unknown[]) => getPhoneNumberInfo(...a) }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() } }));

import logger from "@/lib/logger";
import { getWhatsAppStartLink, resetWhatsAppStartLinkCache } from "@/lib/communications/whatsapp/startLink";

const HOUR = 60 * 60 * 1000;
/** The account's personal START code (startCode.ts): the link types `START <code>`. */
const CODE = "K7P4QX";
const LINK = "https://wa.me/15551234567?text=START%20K7P4QX";
let now = Date.parse("2026-10-02T10:00:00Z");

beforeEach(() => {
  jest.clearAllMocks();
  resetWhatsAppStartLinkCache();
  live = true;
  now = Date.parse("2026-10-02T10:00:00Z");
  jest.spyOn(Date, "now").mockImplementation(() => now);
  getPhoneNumberInfo.mockResolvedValue({ displayPhoneNumber: "+1 555-123-4567", verifiedName: "MPLOYEDIN" });
});

afterEach(() => jest.restoreAllMocks());

describe("getWhatsAppStartLink", () => {
  it("is a wa.me link to the business number's digits with START and the account's code typed", async () => {
    expect(await getWhatsAppStartLink(CODE)).toBe(LINK);
  });

  it("encodes the typed text with encodeURIComponent", async () => {
    expect(await getWhatsAppStartLink("AB23CD")).toBe(`https://wa.me/15551234567?text=${encodeURIComponent("START AB23CD")}`);
  });

  it("is null in mock mode, without asking Meta", async () => {
    live = false;
    expect(await getWhatsAppStartLink(CODE)).toBeNull();
    expect(getPhoneNumberInfo).not.toHaveBeenCalled();
  });

  it("asks Meta once an hour, not on every page load", async () => {
    await getWhatsAppStartLink(CODE);
    now += HOUR - 1;
    expect(await getWhatsAppStartLink(CODE)).toBe(LINK);
    expect(getPhoneNumberInfo).toHaveBeenCalledTimes(1);
    now += 2;
    getPhoneNumberInfo.mockResolvedValue({ displayPhoneNumber: "971 4 123 4567" });
    expect(await getWhatsAppStartLink(CODE)).toBe("https://wa.me/97141234567?text=START%20K7P4QX");
    expect(getPhoneNumberInfo).toHaveBeenCalledTimes(2);
  });

  it("shares one lookup between page loads that arrive together", async () => {
    const [a, b] = await Promise.all([getWhatsAppStartLink(CODE), getWhatsAppStartLink(CODE)]);
    expect([a, b]).toEqual([LINK, LINK]);
    expect(getPhoneNumberInfo).toHaveBeenCalledTimes(1);
  });

  it("is null when the lookup fails, never throws, and does not retry on every load", async () => {
    getPhoneNumberInfo.mockRejectedValue(new Error("Graph API responded 500"));
    await expect(getWhatsAppStartLink(CODE)).resolves.toBeNull();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    now += 60_000;
    expect(await getWhatsAppStartLink(CODE)).toBeNull();
    expect(getPhoneNumberInfo).toHaveBeenCalledTimes(1);
    // A few minutes later it tries again.
    now += 5 * 60_000;
    getPhoneNumberInfo.mockResolvedValue({ displayPhoneNumber: "+1 555-123-4567" });
    expect(await getWhatsAppStartLink(CODE)).toBe(LINK);
  });

  it("is null when Meta reports no display number", async () => {
    getPhoneNumberInfo.mockResolvedValue({});
    expect(await getWhatsAppStartLink(CODE)).toBeNull();
  });

  it("does not hold a page load for Meta's full timeout: a slow lookup answers null, and its answer serves the next load", async () => {
    jest.useFakeTimers({ doNotFake: ["Date"] });
    try {
      let answer: (v: { displayPhoneNumber: string }) => void = () => {};
      getPhoneNumberInfo.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
      const first = getWhatsAppStartLink(CODE);
      await jest.advanceTimersByTimeAsync(2_000);
      await expect(first).resolves.toBeNull();
      answer({ displayPhoneNumber: "+1 555-123-4567" });
      await Promise.resolve();
      expect(await getWhatsAppStartLink(CODE)).toBe(LINK);
      expect(getPhoneNumberInfo).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
