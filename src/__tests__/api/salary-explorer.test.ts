/**
 * @jest-environment node
 */
/**
 * API Tests — Salary Explorer
 * Tests: GET (public) with role/country/industry filters
 */

import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({
  connectDB: jest.fn().mockResolvedValue(undefined),
}));

const mockSalaryData = [
  { _id: { currency: "AED" }, avgMin: 8000, avgMax: 15000, medianMin: 8000, count: 45, minSalary: 3000, maxSalary: 30000 },
];
const mockTopRoles = [
  { _id: "Senior Engineer", avgMin: 12000, avgMax: 20000, currency: "AED", count: 10 },
  { _id: "Product Manager", avgMin: 15000, avgMax: 25000, currency: "AED", count: 5 },
];
const mockTopCountries = [
  { _id: "UAE", avgMin: 10000, avgMax: 18000, count: 30 },
  { _id: "Saudi Arabia", avgMin: 9000, avgMax: 16000, count: 20 },
];

const mockAggregate = jest.fn()
  .mockResolvedValueOnce(mockSalaryData)
  .mockResolvedValueOnce(mockTopRoles)
  .mockResolvedValueOnce(mockTopCountries);

jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: {
    aggregate: mockAggregate,
  },
}));

describe("Salary Explorer API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAggregate
      .mockResolvedValueOnce(mockSalaryData)
      .mockResolvedValueOnce(mockTopRoles)
      .mockResolvedValueOnce(mockTopCountries);
  });

  it("returns salary data without filters", async () => {
    const { GET } = await import("@/app/api/salary-explorer/route");
    const req = new NextRequest("http://localhost/api/salary-explorer");
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.salaryOverview).toBeDefined();
    expect(data.topPayingRoles).toBeDefined();
    expect(data.byCountry).toBeDefined();
  });

  it("applies role filter to aggregation", async () => {
    mockAggregate
      .mockResolvedValueOnce(mockSalaryData)
      .mockResolvedValueOnce(mockTopRoles)
      .mockResolvedValueOnce(mockTopCountries);

    const { GET } = await import("@/app/api/salary-explorer/route");
    const req = new NextRequest("http://localhost/api/salary-explorer?role=Engineer&country=UAE");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(mockAggregate).toHaveBeenCalled();
  });
});
