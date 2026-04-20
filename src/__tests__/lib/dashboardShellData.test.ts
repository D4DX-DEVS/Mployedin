/**
 * @jest-environment node
 */

const connectDBMock = jest.fn();
const userFindByIdMock = jest.fn();
const employerFindOneMock = jest.fn();

jest.mock("@/lib/db/mongoose", () => ({
  __esModule: true,
  default: () => connectDBMock(),
}));

jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    findById: (...args: unknown[]) => userFindByIdMock(...args),
  },
}));

jest.mock("@/models/Employer", () => ({
  Employer: {
    findOne: (...args: unknown[]) => employerFindOneMock(...args),
  },
}));

import {
  clearDashboardShellCache,
  getCachedDashboardShellData,
} from "@/lib/dashboard/shellData";

describe("dashboard shell caching", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearDashboardShellCache();
    connectDBMock.mockResolvedValue(undefined);
  });

  it("reuses dashboard shell lookups for repeated requests from the same user", async () => {
    const userLeanMock = jest.fn().mockResolvedValue({
      lastLogin: new Date("2026-04-20T12:00:00.000Z"),
    });
    const employerLeanMock = jest.fn().mockResolvedValue({ logo: "https://cdn.example/logo.png" });

    userFindByIdMock.mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: userLeanMock }),
    });
    employerFindOneMock.mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: employerLeanMock }),
    });

    const first = await getCachedDashboardShellData("user-1", "employer");
    const second = await getCachedDashboardShellData("user-1", "employer");

    expect(first).toEqual(second);
    expect(connectDBMock).toHaveBeenCalledTimes(1);
    expect(userFindByIdMock).toHaveBeenCalledTimes(1);
    expect(employerFindOneMock).toHaveBeenCalledTimes(1);
  });
});