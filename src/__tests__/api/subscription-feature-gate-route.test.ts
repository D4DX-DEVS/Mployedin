/**
 * @jest-environment node
 *
 * GET /api/subscriptions/feature-gate used to hard-code `{ features: {},
 * bypass: true }`. That is the right answer only while the global enforcement
 * flag is OFF — once an admin turns enforcement on, the server gates start
 * rejecting while the client still believes every feature is unlocked.
 */

import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(undefined),
  connectDB: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/auth/config", () => ({ auth: jest.fn() }));

jest.mock("@/lib/permissions/matrix", () => ({
  canAccess: jest.fn().mockReturnValue(true),
}));

jest.mock("@/lib/subscription/enforcementFlag", () => ({
  isSubscriptionEnforcementEnabled: jest.fn(),
  clearSubscriptionEnforcementCache: jest.fn(),
}));

jest.mock("@/lib/subscription/featureGate", () => ({
  getFeatureGateMap: jest.fn(),
}));

 
const { auth } = require("@/lib/auth/config") as { auth: jest.Mock };
 
const { isSubscriptionEnforcementEnabled } = require("@/lib/subscription/enforcementFlag") as {
  isSubscriptionEnforcementEnabled: jest.Mock;
};
 
const { getFeatureGateMap } = require("@/lib/subscription/featureGate") as {
  getFeatureGateMap: jest.Mock;
};

const ROUTE_CTX = { params: Promise.resolve({}) };

function request() {
  return new NextRequest("http://localhost:3888/api/subscriptions/feature-gate");
}

beforeEach(() => {
  jest.clearAllMocks();
  getFeatureGateMap.mockResolvedValue({ dataExport: { allowed: false } });
});

describe("GET /api/subscriptions/feature-gate", () => {
  test("bypasses while subscription enforcement is off", async () => {
    auth.mockResolvedValue({ user: { id: "u1", role: "employer", locale: "en" } });
    isSubscriptionEnforcementEnabled.mockResolvedValue(false);

    const { GET } = await import("@/app/api/subscriptions/feature-gate/route");
    const res = await GET(request(), ROUTE_CTX);
    const body = await res.json();

    expect(body).toEqual({ features: {}, bypass: true });
    expect(getFeatureGateMap).not.toHaveBeenCalled();
  });

  test("returns the real plan map once enforcement is on", async () => {
    auth.mockResolvedValue({ user: { id: "u1", role: "employer", locale: "en" } });
    isSubscriptionEnforcementEnabled.mockResolvedValue(true);

    const { GET } = await import("@/app/api/subscriptions/feature-gate/route");
    const res = await GET(request(), ROUTE_CTX);
    const body = await res.json();

    expect(getFeatureGateMap).toHaveBeenCalledWith("u1", "employer");
    expect(body.bypass).toBe(false);
    expect(body.features.dataExport.allowed).toBe(false);
  });

  test("keeps bypassing staff roles even with enforcement on", async () => {
    auth.mockResolvedValue({ user: { id: "a1", role: "agent", locale: "en" } });
    isSubscriptionEnforcementEnabled.mockResolvedValue(true);

    const { GET } = await import("@/app/api/subscriptions/feature-gate/route");
    const res = await GET(request(), ROUTE_CTX);
    const body = await res.json();

    expect(body).toEqual({ features: {}, bypass: true });
    expect(getFeatureGateMap).not.toHaveBeenCalled();
  });

  test("scopes job seekers to the job_seeker plan map", async () => {
    auth.mockResolvedValue({ user: { id: "s1", role: "job_seeker", locale: "en" } });
    isSubscriptionEnforcementEnabled.mockResolvedValue(true);

    const { GET } = await import("@/app/api/subscriptions/feature-gate/route");
    await GET(request(), ROUTE_CTX);

    expect(getFeatureGateMap).toHaveBeenCalledWith("s1", "job_seeker");
  });
});
