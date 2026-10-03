/**
 * @jest-environment node
 *
 * Admin user overrides live in one array on the SystemConfig document.
 * getUserOverride reads it for one user; the WhatsApp broadcast and schedule
 * leg needs the force-unsubscribed set for a whole batch in one read.
 */
import SystemConfig, { getForceUnsubscribedUserIds } from "@/models/SystemConfig";

jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), info: jest.fn(), debug: jest.fn(), warn: jest.fn() } }));

afterEach(() => jest.restoreAllMocks());

describe("getForceUnsubscribedUserIds", () => {
  it("returns the users with a force_unsubscribe override, and only those, from one read", async () => {
    const findOne = jest.spyOn(SystemConfig, "findOne").mockResolvedValue({
      userOverrides: [
        { userId: "u1", action: "force_unsubscribe" },
        { userId: "u2", action: "pause_emails" },
        { userId: "u3", action: "force_instant" },
        { userId: "u4", action: "force_unsubscribe" },
      ],
    } as never);
    expect(await getForceUnsubscribedUserIds()).toEqual(new Set(["u1", "u4"]));
    expect(findOne).toHaveBeenCalledTimes(1);
  });

  it("is empty when no override is stored", async () => {
    jest.spyOn(SystemConfig, "findOne").mockResolvedValue({ userOverrides: [] } as never);
    expect((await getForceUnsubscribedUserIds()).size).toBe(0);
  });
});
