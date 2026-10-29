/**
 * @jest-environment node
 */
const mockDistinct = jest.fn();
jest.mock("@/models/NotificationPreference", () => ({
  __esModule: true,
  default: { distinct: (...args: unknown[]) => mockDistinct(...args) },
}));

import { withIdRange } from "@/lib/communications/broadcastAudience";
import { broadcastAudienceQuery } from "@/lib/communications/broadcastAudienceServer";

describe("broadcast audience by purpose", () => {
  beforeEach(() => mockDistinct.mockReset().mockResolvedValue(["u1", "u2"]));

  it("sends a service notice to every active user of the roles, without reading preferences", async () => {
    await expect(broadcastAudienceQuery(false, ["employer"], "service")).resolves.toEqual({ isActive: true, role: "employer" });
    expect(mockDistinct).not.toHaveBeenCalled();
  });

  it("sends marketing only to users who turned marketing on and did not unsubscribe from everything", async () => {
    const query = await broadcastAudienceQuery(true, null, "marketing");
    expect(mockDistinct).toHaveBeenCalledWith("userId", {
      "categories.marketing.enabled": true,
      unsubscribedAll: { $ne: true },
    });
    expect(query).toEqual({ isActive: true, _id: { $in: ["u1", "u2"] } });
  });

  it("keeps the opt-in list when a batch adds its _id range", () => {
    const query = { isActive: true, _id: { $in: ["u1", "u2"] } };
    expect(withIdRange(query, { $gt: "u1" })).toEqual({ isActive: true, _id: { $in: ["u1", "u2"], $gt: "u1" } });
  });

  it("adds a plain range to a service audience", () => {
    expect(withIdRange({ isActive: true }, { $gt: "a", $lte: "b" })).toEqual({ isActive: true, _id: { $gt: "a", $lte: "b" } });
  });
});
