/**
 * @jest-environment node
 */
jest.mock("@/lib/db/mongoose", () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(undefined),
  connectDB: jest.fn().mockResolvedValue(undefined),
}));

let mockContext: { userId: string; role: string } = { userId: "64b000000000000000000001", role: "employer" };

jest.mock("@/lib/auth/withAuth", () => ({
  __esModule: true,
  withAuth: (handler: Function, _opts: unknown) => {
    return async (req: any, context: { params: Promise<Record<string, string>> }) => {
      const params = await context.params;
      return handler(req, mockContext, params);
    };
  },
}));

jest.mock("@/lib/validators", () => ({
  __esModule: true,
  validateBody: jest.fn(async (req: NextRequest) => req.json()),
}));

import { NextRequest } from "next/server";
import mongoose from "mongoose";


const EMPLOYER_USER_1 = "64b000000000000000000001";
const EMPLOYER_USER_2 = "64b000000000000000000002";
const EMPLOYER_ID_1 = new mongoose.Types.ObjectId();
const EMPLOYER_ID_2 = new mongoose.Types.ObjectId();
const VIEW_ID_1 = new mongoose.Types.ObjectId();
const VIEW_ID_2 = new mongoose.Types.ObjectId();
const VIEW_ID_3 = new mongoose.Types.ObjectId();

let employerData: Map<string, any> = new Map();

jest.mock("@/models/Employer", () => {
  const mockEmployer = {
    findOne: jest.fn((query: any) => ({
      select: jest.fn(() => ({
        lean: jest.fn(async () => {
          const userId = query.userId;
          return employerData.get(userId) || null;
        }),
      })),
    })),
    updateOne: jest.fn(async (filter: any, update: any) => {
      const emp = employerData.get(filter.userId);
      if (emp && update.$pull?.savedViews) {
        const id = String(update.$pull.savedViews._id);
        emp.savedViews = emp.savedViews.filter((v: any) => String(v._id) !== id);
        employerData.set(filter.userId, emp);
      }
      return { acknowledged: true };
    }),
    findOneAndUpdate: jest.fn(async (filter: any, update: any, opts: any) => {
      const userId = filter.userId;
      let emp = employerData.get(userId);
      if (!emp && opts?.upsert) {
        emp = {
          _id: new (mongoose as any).Types.ObjectId(),
          userId,
          savedViews: [],
        };
      }
      if (emp) {
        if (update.$push?.savedViews) {
          emp.savedViews.push(update.$push.savedViews);
          employerData.set(userId, emp);
          return emp;
        } else if (update.$pull?.savedViews) {
          const oldLength = emp.savedViews.length;
          const viewIdToDelete = String(update.$pull.savedViews._id);
          const userIdToDelete = String(update.$pull.savedViews.userId);
          emp.savedViews = emp.savedViews.filter((v: any) => {
            const viewIdMatch = String(v._id) === viewIdToDelete;
            const userIdMatch = String(v.userId) === userIdToDelete;
            return !(viewIdMatch && userIdMatch);
          });
          // If nothing was removed, return null (view not found for this user)
          if (emp.savedViews.length === oldLength) {
            return null;
          }
          employerData.set(userId, emp);
          return emp;
        }
      }
      return null;
    }),
  };
  return {
    __esModule: true,
    default: mockEmployer,
    Employer: mockEmployer,
  };
});

async function callRoute(
  method: string,
  ctx: { userId: string; role: string },
  body?: Record<string, unknown>,
  url: string = "/api/employers/saved-views"
) {
  // Set the context that the withAuth mock will use
  mockContext = ctx;

  const { GET, POST, DELETE } = await import("@/app/api/employers/saved-views/route");
  const req = new NextRequest(`http://localhost:3000${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

  const context = { params: Promise.resolve({}) };

  if (method === "GET") return GET(req, context as any) as Promise<Response>;
  if (method === "POST") return POST(req, context as any) as Promise<Response>;
  if (method === "DELETE") return DELETE(req, context as any) as Promise<Response>;
  throw new Error("Unknown method");
}

describe("GET /api/employers/saved-views", () => {
  beforeEach(() => {
    employerData.clear();
  });

  it("returns 404 when employer profile not found", async () => {
    const res = await callRoute("GET", { userId: EMPLOYER_USER_1, role: "employer" });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("Employer profile not found");
  });

  it("returns views for current user only, newest first", async () => {
    const now = new Date();
    const oldDate = new Date(now.getTime() - 10000);
    employerData.set(EMPLOYER_USER_1, {
      _id: EMPLOYER_ID_1,
      userId: EMPLOYER_USER_1,
      savedViews: [
        {
          _id: VIEW_ID_1,
          userId: EMPLOYER_USER_1,
          name: "Old View",
          query: "status=applied",
          createdAt: oldDate,
        },
        {
          _id: VIEW_ID_2,
          userId: EMPLOYER_USER_2,
          name: "Other User View",
          query: "status=shortlisted",
          createdAt: now,
        },
        {
          _id: VIEW_ID_3,
          userId: EMPLOYER_USER_1,
          name: "New View",
          query: "scoreMin=70",
          createdAt: now,
        },
      ],
    });

    const res = await callRoute("GET", { userId: EMPLOYER_USER_1, role: "employer" });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.views).toHaveLength(2);
    expect(data.views[0].name).toBe("New View");
    expect(data.views[1].name).toBe("Old View");
  });

  it("returns 403 for non-employer roles", async () => {
    const res = await callRoute("GET", { userId: EMPLOYER_USER_1, role: "admin" });
    expect(res.status).toBe(403);
  });
});

describe("POST /api/employers/saved-views", () => {
  beforeEach(() => {
    employerData.clear();
    employerData.set(EMPLOYER_USER_1, {
      _id: EMPLOYER_ID_1,
      userId: EMPLOYER_USER_1,
      savedViews: [],
    });
  });

  it("returns 404 when employer profile not found", async () => {
    const res = await callRoute("POST", { userId: EMPLOYER_USER_2, role: "employer" }, {
      name: "Test View",
      query: "status=applied",
    });
    expect(res.status).toBe(404);
  });

  it("creates a new saved view", async () => {
    const res = await callRoute("POST", { userId: EMPLOYER_USER_1, role: "employer" }, {
      name: "Top Matches",
      query: "scoreMin=70",
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.name).toBe("Top Matches");
    expect(data.query).toBe("scoreMin=70");
    expect(data.createdAt).toBeDefined();
  });

  it("strips leading ? from query", async () => {
    const res = await callRoute("POST", { userId: EMPLOYER_USER_1, role: "employer" }, {
      name: "Test",
      query: "?scoreMin=70&status=applied",
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.query).toBe("scoreMin=70&status=applied");
  });

  it("rejects views with page= in the query", async () => {
    const res = await callRoute("POST", { userId: EMPLOYER_USER_1, role: "employer" }, {
      name: "Test",
      query: "status=applied&page=2",
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when user reaches 20 view limit", async () => {
    const emp = employerData.get(EMPLOYER_USER_1)!;
    for (let i = 0; i < 20; i++) {
      emp.savedViews.push({
        _id: new mongoose.Types.ObjectId(),
        userId: EMPLOYER_USER_1,
        name: `View ${i}`,
        query: "",
        createdAt: new Date(),
      });
    }

    const res = await callRoute("POST", { userId: EMPLOYER_USER_1, role: "employer" }, {
      name: "Too Many",
      query: "status=applied",
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/20 saved views/);
  });

  it("returns 403 for non-employer roles", async () => {
    const res = await callRoute("POST", { userId: EMPLOYER_USER_1, role: "admin" }, {
      name: "Test",
      query: "",
    });
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/employers/saved-views", () => {
  beforeEach(() => {
    employerData.clear();
    employerData.set(EMPLOYER_USER_1, {
      _id: EMPLOYER_ID_1,
      userId: EMPLOYER_USER_1,
      savedViews: [
        {
          _id: VIEW_ID_1,
          userId: EMPLOYER_USER_1,
          name: "My View",
          query: "status=applied",
          createdAt: new Date(),
        },
        {
          _id: VIEW_ID_2,
          userId: EMPLOYER_USER_2,
          name: "Other View",
          query: "status=shortlisted",
          createdAt: new Date(),
        },
      ],
    });
  });

  it("deletes only the caller's view", async () => {
    const res = await callRoute(
      "DELETE",
      { userId: EMPLOYER_USER_1, role: "employer" },
      undefined,
      `/api/employers/saved-views?id=${VIEW_ID_1}`
    );
    expect(res.status).toBe(200);
  });

  it("returns 404 when trying to delete someone else's view", async () => {
    const res = await callRoute(
      "DELETE",
      { userId: EMPLOYER_USER_1, role: "employer" },
      undefined,
      `/api/employers/saved-views?id=${VIEW_ID_2}`
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 for non-employer roles", async () => {
    const res = await callRoute(
      "DELETE",
      { userId: EMPLOYER_USER_1, role: "admin" },
      undefined,
      `/api/employers/saved-views?id=${VIEW_ID_1}`
    );
    expect(res.status).toBe(403);
  });
});
