/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";

const mockRouteGenerate = jest.fn();
const mockCheckRateLimitDual = jest.fn();
const mockSanitizeAIInput = jest.fn((value: string) => value);
const mockRedactPII = jest.fn((value: string) => value);

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: { userId: string; role: string; locale: string; permissionMode: string }) => Promise<Response>) => {
    return (req: NextRequest) => handler(req, {
      userId: "admin_001",
      role: "admin",
      locale: "en",
      permissionMode: "role_default",
    });
  },
}));

jest.mock("@/lib/db/mongoose", () => ({
  connectDB: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/ai/router", () => ({
  routeGenerate: (...args: unknown[]) => mockRouteGenerate(...args),
}));

jest.mock("@/lib/ai/sanitize", () => ({
  sanitizeAIInput: (value: string) => mockSanitizeAIInput(value),
  redactPII: (value: string) => mockRedactPII(value),
}));

jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimitDual: (...args: unknown[]) => mockCheckRateLimitDual(...args),
  RATE_LIMIT_CONFIGS: {
    ai: { windowMs: 60_000, limit: 10 },
  },
}));

const mockUserCountDocuments = jest.fn();
const mockUserFind = jest.fn();
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    countDocuments: (...args: unknown[]) => mockUserCountDocuments(...args),
    find: (...args: unknown[]) => mockUserFind(...args),
  },
}));

const mockJobCountDocuments = jest.fn();
const mockJobAggregate = jest.fn();
jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: {
    countDocuments: (...args: unknown[]) => mockJobCountDocuments(...args),
    aggregate: (...args: unknown[]) => mockJobAggregate(...args),
  },
}));

const mockApplicationCountDocuments = jest.fn();
const mockApplicationAggregate = jest.fn();
jest.mock("@/models/Application", () => ({
  Application: {
    countDocuments: (...args: unknown[]) => mockApplicationCountDocuments(...args),
    aggregate: (...args: unknown[]) => mockApplicationAggregate(...args),
  },
}));

const mockAgentFind = jest.fn();
jest.mock("@/models/Agent", () => ({
  Agent: {
    find: (...args: unknown[]) => mockAgentFind(...args),
  },
}));

const mockEmployerFind = jest.fn();
jest.mock("@/models/Employer", () => ({
  Employer: {
    find: (...args: unknown[]) => mockEmployerFind(...args),
  },
}));

const mockPlacementCountDocuments = jest.fn();
jest.mock("@/models/Placement", () => ({
  Placement: {
    countDocuments: (...args: unknown[]) => mockPlacementCountDocuments(...args),
  },
}));

const mockCommissionAggregate = jest.fn();
jest.mock("@/models/Commission", () => ({
  Commission: {
    aggregate: (...args: unknown[]) => mockCommissionAggregate(...args),
  },
}));

const mockJobSeekerAggregate = jest.fn();
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    aggregate: (...args: unknown[]) => mockJobSeekerAggregate(...args),
  },
}));

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/ai/report", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function createSelectLeanChain<T>(value: T) {
  return {
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(value),
    }),
  };
}

describe("POST /api/ai/report", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockCheckRateLimitDual.mockReturnValue({
      allowed: true,
      resetAt: Date.now() + 60_000,
    });

    mockUserCountDocuments
      .mockResolvedValueOnce(15)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(8)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(15)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(8);
    mockUserFind.mockReturnValue(createSelectLeanChain([{ _id: "user_001", name: "Agent One" }]));

    mockJobCountDocuments
      .mockResolvedValueOnce(11)
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(11)
      .mockResolvedValueOnce(0);
    mockJobAggregate
      .mockResolvedValueOnce([{ _id: "Technology", count: 4 }])
      .mockResolvedValueOnce([{ _id: "India", count: 7 }])
      .mockResolvedValueOnce([{ _id: "employer_001", jobCount: 7 }]);

    mockApplicationCountDocuments
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    mockApplicationAggregate.mockResolvedValue([{ _id: "Technology", applications: 2 }]);

    mockPlacementCountDocuments
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    mockCommissionAggregate
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    mockAgentFind.mockReturnValue({
      select: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue([
              {
                userId: "user_001",
                performance: {
                  placementsCompleted: 0,
                  leadsGenerated: 0,
                },
              },
            ]),
          }),
        }),
      }),
    });

    mockEmployerFind.mockReturnValue(
      createSelectLeanChain([
        { _id: "employer_001", companyName: "d4dx", industry: "Technology" },
      ])
    );
    mockJobSeekerAggregate.mockResolvedValue([{ _id: "India", count: 5 }]);

    mockRouteGenerate.mockResolvedValue([
      "Of course. Here is the analytics report based on the live platform data.",
      "",
      "# Analytics Report",
      "",
      "## Direct Answer",
      "- Latest activity is concentrated in one employer.",
    ].join("\n"));
  });

  it("removes conversational filler and enforces the report formatting prompt", async () => {
    const { POST } = await import("@/app/api/ai/report/route");
    const response = await POST(makeRequest({ query: "Summarize platform activity" }), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(200);

    const json = await response.json();

    expect(json.report).toBe([
      "# Analytics Report",
      "",
      "## Direct Answer",
      "- Latest activity is concentrated in one employer.",
    ].join("\n"));
    expect(mockRouteGenerate).toHaveBeenCalledWith(
      expect.stringContaining('Do not add conversational filler such as "Of course", "Sure", or similar openings.'),
      "report"
    );
  });
});