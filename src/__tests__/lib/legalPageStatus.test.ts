/**
 * @jest-environment node
 */

jest.mock("next/cache", () => ({
  unstable_cache: <T,>(fn: T) => fn,
}));

const connectDB = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/db/mongoose", () => ({ connectDB: () => connectDB() }));

const exists = jest.fn();
jest.mock("@/models/StaticPage", () => ({
  __esModule: true,
  default: { exists: (filter: unknown) => exists(filter) },
}));

jest.mock("@/lib/logger", () => ({ __esModule: true, default: { warn: jest.fn() } }));

import { isLegalPagePublished } from "@/lib/cms/legalPageStatus";

/**
 * The accessibility statement's footer link, side tab, sitemap entry and page
 * appear only once an admin sets it Active in CMS → Static Pages.
 */
describe("isLegalPagePublished", () => {
  beforeEach(() => jest.clearAllMocks());

  it("is true only for an Active page", async () => {
    exists.mockResolvedValueOnce({ _id: "p1" });
    await expect(isLegalPagePublished("accessibility-statement")).resolves.toBe(true);
    expect(exists).toHaveBeenCalledWith({ slug: "accessibility-statement", isActive: true });

    exists.mockResolvedValueOnce(null);
    await expect(isLegalPagePublished("accessibility-statement")).resolves.toBe(false);
  });

  it("hides the links rather than breaking the page when the database is unreachable", async () => {
    connectDB.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    await expect(isLegalPagePublished("accessibility-statement")).resolves.toBe(false);
  });
});
