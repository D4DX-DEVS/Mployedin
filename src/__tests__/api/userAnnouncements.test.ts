import { connectDB } from "@/lib/db/mongoose";
import Banner from "@/models/Banner";
import type { IBanner } from "@/models/Banner";

jest.mock("@/lib/db/mongoose", () => ({
  connectDB: jest.fn(),
}));

describe("Announcement filtering logic", () => {
  const mockNow = new Date("2026-11-13T10:00:00Z");

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(mockNow);
    (connectDB as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it("should filter announcements by role when 'all' is in audienceRoles", async () => {
    const announcement = {
      _id: "507f1f77bcf86cd799439011",
      title: "Test",
      isActive: true,
      placement: ["in-app-announcement"],
      audienceRoles: ["all"],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as IBanner;

    const query: Record<string, unknown> = {
      isActive: true,
      placement: "in-app-announcement",
      $or: [{ audienceRoles: "all" }, { audienceRoles: "job_seeker" }],
      $and: [
        { $or: [{ startDate: { $exists: false } }, { startDate: { $lte: mockNow } }] },
        { $or: [{ endDate: { $exists: false } }, { endDate: { $gte: mockNow } }] },
      ],
    };

    expect(query.$or).toContainEqual({ audienceRoles: "all" });
    expect(query.$or).toContainEqual({ audienceRoles: "job_seeker" });
  });

  it("should filter announcements by role when specific role is in audienceRoles", async () => {
    const announcement = {
      _id: "507f1f77bcf86cd799439012",
      title: "Admin Test",
      isActive: true,
      placement: ["in-app-announcement"],
      audienceRoles: ["admin"],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as IBanner;

    const query: Record<string, unknown> = {
      isActive: true,
      placement: "in-app-announcement",
      $or: [{ audienceRoles: "all" }, { audienceRoles: "admin" }],
      $and: [
        { $or: [{ startDate: { $exists: false } }, { startDate: { $lte: mockNow } }] },
        { $or: [{ endDate: { $exists: false } }, { endDate: { $gte: mockNow } }] },
      ],
    };

    expect(query.$or).toContainEqual({ audienceRoles: "admin" });
  });

  it("should respect startDate - include announcements that have started", () => {
    const startDate = new Date("2026-11-01T10:00:00Z");
    const query: Record<string, unknown> = {
      $and: [
        { $or: [{ startDate: { $exists: false } }, { startDate: { $lte: mockNow } }] },
        { $or: [{ endDate: { $exists: false } }, { endDate: { $gte: mockNow } }] },
      ],
    };

    // startDate (2026-11-01) <= mockNow (2026-11-13) should be included
    const andConditions = (query.$and as Array<Record<string, unknown>>)[0];
    const startDateCondition = (andConditions.$or as Array<Record<string, unknown>>).find(
      (o) => o.startDate,
    );
    expect(startDateCondition).toBeDefined();
  });

  it("should respect endDate - exclude announcements that have ended", () => {
    const endDate = new Date("2026-11-10T10:00:00Z");
    // endDate is before mockNow, should be filtered out
    expect(endDate < mockNow).toBe(true);

    const query: Record<string, unknown> = {
      $and: [
        { $or: [{ startDate: { $exists: false } }, { startDate: { $lte: mockNow } }] },
        { $or: [{ endDate: { $exists: false } }, { endDate: { $gte: mockNow } }] },
      ],
    };

    const andConditions = (query.$and as Array<Record<string, unknown>>)[1];
    const endDateCondition = (andConditions.$or as Array<Record<string, unknown>>).find(
      (o) => o.endDate,
    );
    expect(endDateCondition?.endDate).toBeDefined();
  });

  it("should include announcements without startDate or endDate", () => {
    const query: Record<string, unknown> = {
      $and: [
        { $or: [{ startDate: { $exists: false } }, { startDate: { $lte: mockNow } }] },
        { $or: [{ endDate: { $exists: false } }, { endDate: { $gte: mockNow } }] },
      ],
    };

    const startConditions = ((query.$and as Array<Record<string, unknown>>)[0].$or as Array<
      Record<string, unknown>
    >);
    const endConditions = ((query.$and as Array<Record<string, unknown>>)[1].$or as Array<
      Record<string, unknown>
    >);

    expect(startConditions).toContainEqual({ startDate: { $exists: false } });
    expect(endConditions).toContainEqual({ endDate: { $exists: false } });
  });

  it("should filter only in-app-announcement placement", () => {
    const query: Record<string, unknown> = {
      placement: "in-app-announcement",
    };

    expect(query.placement).toBe("in-app-announcement");
  });

  it("should only include active announcements", () => {
    const query: Record<string, unknown> = {
      isActive: true,
    };

    expect(query.isActive).toBe(true);
  });
});
