/**
 * @jest-environment node
 */
/**
 * Which Terms/Privacy version a user must have accepted, and whether they
 * still owe it. Admins run the platform and are never asked; everyone else is
 * asked until their accepted version equals the current one.
 */
const settingsFindOne = jest.fn();
const settingsUpdate = jest.fn();
const userFindById = jest.fn();

jest.mock("@/lib/db/mongoose", () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(undefined),
  connectDB: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/models/SystemSettings", () => ({
  __esModule: true,
  default: {
    findOne: () => ({ select: () => ({ lean: () => settingsFindOne() }) }),
    findOneAndUpdate: (...a: unknown[]) => ({ lean: () => settingsUpdate(...a) }),
  },
}));
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: { findById: () => ({ select: () => ({ lean: () => userFindById() }) }) },
}));

import {
  TERMS_BASELINE_VERSION,
  bumpTermsVersion,
  clearTermsVersionCache,
  getCurrentTermsVersion,
  isTermsAcceptancePending,
  termsPendingFor,
} from "@/lib/gdpr/termsVersion";

beforeEach(() => {
  jest.clearAllMocks();
  clearTermsVersionCache();
});

describe("termsPendingFor", () => {
  it("never asks an admin", () => {
    expect(termsPendingFor("admin", undefined, "v2")).toBe(false);
  });

  it("asks a user who never accepted", () => {
    expect(termsPendingFor("employer", undefined, "v2")).toBe(true);
  });

  it("asks again after the version changes", () => {
    expect(termsPendingFor("job_seeker", "v1", "v2")).toBe(true);
  });

  it("does not ask a user who accepted the current version", () => {
    expect(termsPendingFor("agent", "v2", "v2")).toBe(false);
  });

  it("does not gate anyone when the current version could not be read", () => {
    expect(termsPendingFor("agent", undefined, null)).toBe(false);
  });
});

describe("getCurrentTermsVersion", () => {
  it("falls back to the baseline until an admin sets one", async () => {
    settingsFindOne.mockResolvedValue({});
    await expect(getCurrentTermsVersion()).resolves.toBe(TERMS_BASELINE_VERSION);
  });

  it("uses the stored version", async () => {
    settingsFindOne.mockResolvedValue({ legalTermsVersion: "2026-10-01T09:00:00.000Z" });
    await expect(getCurrentTermsVersion()).resolves.toBe("2026-10-01T09:00:00.000Z");
  });

  it("reads the database once per cache window", async () => {
    settingsFindOne.mockResolvedValue({ legalTermsVersion: "v3" });
    await getCurrentTermsVersion();
    await getCurrentTermsVersion();
    expect(settingsFindOne).toHaveBeenCalledTimes(1);
  });

  it("returns null on a read error and does not cache it", async () => {
    settingsFindOne.mockRejectedValueOnce(new Error("db down"));
    await expect(getCurrentTermsVersion()).resolves.toBeNull();
    settingsFindOne.mockResolvedValue({ legalTermsVersion: "v3" });
    await expect(getCurrentTermsVersion()).resolves.toBe("v3");
  });
});

describe("isTermsAcceptancePending", () => {
  it("compares the user's accepted version with the current one", async () => {
    settingsFindOne.mockResolvedValue({ legalTermsVersion: "v2" });
    userFindById.mockResolvedValue({ role: "employer", termsAcceptedVersion: "v1" });
    await expect(isTermsAcceptancePending("u1")).resolves.toBe(true);

    userFindById.mockResolvedValue({ role: "employer", termsAcceptedVersion: "v2" });
    await expect(isTermsAcceptancePending("u1")).resolves.toBe(false);
  });

  it("uses the stored role, not the caller's guess", async () => {
    settingsFindOne.mockResolvedValue({ legalTermsVersion: "v2" });
    userFindById.mockResolvedValue({ role: "admin" });
    await expect(isTermsAcceptancePending("u1", "employer")).resolves.toBe(false);
  });

  it("does not gate a user it cannot find", async () => {
    settingsFindOne.mockResolvedValue({ legalTermsVersion: "v2" });
    userFindById.mockResolvedValue(null);
    await expect(isTermsAcceptancePending("u1")).resolves.toBe(false);
  });
});

describe("bumpTermsVersion", () => {
  it("stores a new version and serves it at once", async () => {
    settingsFindOne.mockResolvedValue({ legalTermsVersion: "old" });
    await getCurrentTermsVersion();
    settingsUpdate.mockResolvedValue({});

    const version = await bumpTermsVersion(new Date("2026-10-02T08:00:00.000Z"));

    expect(version).toBe("2026-10-02T08:00:00.000Z");
    expect(settingsUpdate).toHaveBeenCalledWith(
      {},
      { $set: { legalTermsVersion: "2026-10-02T08:00:00.000Z" } },
      expect.objectContaining({ upsert: true }),
    );
    await expect(getCurrentTermsVersion()).resolves.toBe("2026-10-02T08:00:00.000Z");
  });
});
