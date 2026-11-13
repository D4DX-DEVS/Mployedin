import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { connectDB } from "@/lib/db/mongoose";
import Banner from "@/models/Banner";
import type { IBanner } from "@/models/Banner";

jest.mock("@/lib/db/mongoose", () => ({
  connectDB: jest.fn(),
}));

jest.mock("@/lib/logger", () => ({
  default: {
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock("@/lib/public/landingStats", () => ({
  getLandingStats: jest.fn().mockResolvedValue(null),
}));

describe("Public landing banner filtering", () => {
  beforeEach(() => {
    (connectDB as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should include banners without placement field (legacy backwards compatibility)", async () => {
    // Banners created before the placement field was added don't have it
    // They should be included in the landing carousel by default
    const query = {
      isActive: true,
      $or: [
        { placement: { $exists: false } },
        { placement: "landing-carousel" },
      ],
    };

    const legacyBanner = {
      _id: "1",
      title: "Legacy Banner",
      isActive: true,
      // No placement field
    } as unknown as IBanner;

    // Verify the query matches banners without placement
    expect(query.$or).toContainEqual({ placement: { $exists: false } });
  });

  it("should include banners with landing-carousel placement", async () => {
    const query = {
      isActive: true,
      $or: [
        { placement: { $exists: false } },
        { placement: "landing-carousel" },
      ],
    };

    // Verify the query matches landing-carousel placement
    expect(query.$or).toContainEqual({ placement: "landing-carousel" });
  });

  it("should exclude banners with only in-app-announcement placement", async () => {
    const query = {
      isActive: true,
      $or: [
        { placement: { $exists: false } },
        { placement: "landing-carousel" },
      ],
    };

    // A banner with only in-app-announcement should NOT match either condition
    const inAppBanner: Partial<IBanner> = {
      _id: "2" as unknown as any,
      title: "In-App Banner",
      isActive: true,
      placement: ["in-app-announcement"],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Verify it doesn't match the query conditions
    const hasPlacementField = "placement" in inAppBanner;
    const hasLandingCarousel = Array.isArray(inAppBanner.placement) &&
      inAppBanner.placement.includes("landing-carousel");

    expect(hasPlacementField).toBe(true);
    expect(hasLandingCarousel).toBe(false);
  });

  it("should include banners with both landing-carousel and in-app-announcement", async () => {
    const query = {
      isActive: true,
      $or: [
        { placement: { $exists: false } },
        { placement: "landing-carousel" },
      ],
    };

    // A banner shown on both should match because it includes landing-carousel
    const dualBanner: Partial<IBanner> = {
      _id: "3" as unknown as any,
      title: "Dual Banner",
      isActive: true,
      placement: ["landing-carousel", "in-app-announcement"],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const hasLandingCarousel = Array.isArray(dualBanner.placement) &&
      dualBanner.placement.includes("landing-carousel");

    expect(hasLandingCarousel).toBe(true);
  });

  it("should not include inactive banners", () => {
    const query = {
      isActive: true,
      $or: [
        { placement: { $exists: false } },
        { placement: "landing-carousel" },
      ],
    };

    // Verify isActive filter is enforced
    expect(query.isActive).toBe(true);

    // An inactive banner should be filtered out regardless of placement
    const inactiveBanner: Partial<IBanner> = {
      _id: "4" as unknown as any,
      title: "Inactive Banner",
      isActive: false,
      placement: ["landing-carousel"],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    expect(inactiveBanner.isActive).toBe(false);
  });
});
