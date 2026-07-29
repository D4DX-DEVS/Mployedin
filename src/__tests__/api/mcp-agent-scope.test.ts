/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({
  __esModule: true,
  connectDB: jest.fn().mockResolvedValue(undefined),
  default: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(() => ({
      select: jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(null),
      })),
    })),
  },
  Agent: {
    findOne: jest.fn(() => ({
      select: jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(null),
      })),
    })),
  },
}));

jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: {
    find: jest.fn(),
    countDocuments: jest.fn(),
  },
  Application: {
    find: jest.fn(),
    countDocuments: jest.fn(),
  },
}));

import Application from "@/models/Application";
import { applicationsGetHandler } from "@/app/api/applications/handlers";

describe("MCP agent application scope", () => {
  it("defaults to an empty result when an agent has no Agent profile", async () => {
    const req = new NextRequest("http://localhost:3000/api/applications?page=1&limit=10");
    const res = await applicationsGetHandler(req, {
      userId: "507f1f77bcf86cd799439011",
      role: "agent",
      locale: "en",
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      applications: [],
      pagination: { page: 1, limit: 10, total: 0, pages: 0 },
    });
    expect(Application.find).not.toHaveBeenCalled();
  });
});
