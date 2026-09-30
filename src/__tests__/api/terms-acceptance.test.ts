/**
 * @jest-environment node
 */
/**
 * /accept-terms records an acceptance once per Terms version: a terms_and_privacy
 * row tied to the version (so the admin Consent Logs can prove which text was
 * accepted) plus the version on the user (which lifts the proxy gate).
 */
import { NextRequest, NextResponse } from "next/server";

const USER_ID = "64e000000000000000000001";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/security/clientIp", () => ({ getClientIp: () => "10.0.0.9" }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), info: jest.fn() } }));
jest.mock("@/lib/gdpr/termsVersion", () => ({ getCurrentTermsVersion: jest.fn(async () => "v2") }));

const findById = jest.fn();
const updateOne = jest.fn();
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    findById: () => ({ select: () => ({ lean: () => findById() }) }),
    updateOne: (...a: unknown[]) => updateOne(...a),
  },
}));
const consentCreate = jest.fn();
jest.mock("@/models/ConsentLog", () => ({
  __esModule: true,
  default: { create: (...a: unknown[]) => consentCreate(...a), insertMany: jest.fn() },
}));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown) => Promise<Response>) =>
    async (req: NextRequest) => {
      try {
        return await handler(req, { userId: USER_ID, role: "agent", locale: "en" });
      } catch (err) {
        if (err instanceof NextResponse) return err;
        throw err;
      }
    },
}));

function accept(body: unknown = { accepted: true }) {
  return new NextRequest("http://localhost/api/user/terms-acceptance", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function post(body?: unknown) {
  const { POST } = await import("@/app/api/user/terms-acceptance/route");
  return POST(accept(body), { params: Promise.resolve({}) });
}

beforeEach(() => {
  jest.clearAllMocks();
  updateOne.mockResolvedValue({ modifiedCount: 1 });
  consentCreate.mockResolvedValue({});
});

describe("POST /api/user/terms-acceptance", () => {
  it("records a first acceptance with its version and stores it on the user", async () => {
    findById.mockResolvedValue({ name: "Ravi Agent" });

    const res = await post();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, version: "v2" });
    expect(updateOne).toHaveBeenCalledWith(
      { _id: USER_ID, termsAcceptedVersion: { $ne: "v2" } },
      { $set: expect.objectContaining({ termsAcceptedVersion: "v2", termsAcceptedAt: expect.any(Date) }) },
    );
    expect(consentCreate).toHaveBeenCalledWith(expect.objectContaining({
      userId: USER_ID,
      userName: "Ravi Agent",
      consentType: "terms_and_privacy",
      granted: true,
      source: "first_sign_in",
      policyVersion: "v2",
      ipAddress: "10.0.0.9",
    }));
  });

  it("marks an acceptance of a newer version as a terms update", async () => {
    findById.mockResolvedValue({ name: "Ravi Agent", termsAcceptedVersion: "v1" });
    await post();
    expect(consentCreate).toHaveBeenCalledWith(expect.objectContaining({ source: "terms_update", policyVersion: "v2" }));
  });

  it("writes nothing when the current version is already accepted", async () => {
    findById.mockResolvedValue({ name: "Ravi Agent", termsAcceptedVersion: "v2" });
    const res = await post();
    expect(res.status).toBe(200);
    expect(updateOne).not.toHaveBeenCalled();
    expect(consentCreate).not.toHaveBeenCalled();
  });

  it("logs one row when two requests race (the claim decides)", async () => {
    findById.mockResolvedValueOnce({ name: "Ravi Agent" }).mockResolvedValueOnce({ termsAcceptedVersion: "v2" });
    updateOne.mockResolvedValue({ modifiedCount: 0 });
    const res = await post();
    expect(res.status).toBe(200);
    expect(consentCreate).not.toHaveBeenCalled();
  });

  it("reports an error when the version was not saved, instead of claiming success", async () => {
    findById.mockResolvedValueOnce({ name: "Ravi Agent" }).mockResolvedValueOnce({});
    updateOne.mockResolvedValue({ modifiedCount: 0 });
    const res = await post();
    expect(res.status).toBe(500);
    expect(consentCreate).not.toHaveBeenCalled();
  });

  it("undoes the claim when the log row cannot be written", async () => {
    findById.mockResolvedValue({ name: "Ravi Agent" });
    consentCreate.mockRejectedValue(new Error("db down"));

    const res = await post();

    expect(res.status).toBe(500);
    expect(updateOne).toHaveBeenLastCalledWith(
      { _id: USER_ID, termsAcceptedVersion: "v2" },
      { $unset: { termsAcceptedVersion: 1, termsAcceptedAt: 1 } },
    );
  });

  it("restores the earlier version when undoing a re-acceptance", async () => {
    const earlier = new Date("2026-09-01T00:00:00Z");
    findById.mockResolvedValue({ name: "Ravi Agent", termsAcceptedVersion: "v1", termsAcceptedAt: earlier });
    consentCreate.mockRejectedValue(new Error("db down"));

    await post();

    expect(updateOne).toHaveBeenLastCalledWith(
      { _id: USER_ID, termsAcceptedVersion: "v2" },
      { $set: { termsAcceptedVersion: "v1", termsAcceptedAt: earlier } },
    );
  });

  it("requires the box to be ticked", async () => {
    const res = await post({ accepted: false });
    expect(res.status).toBe(400);
    expect(updateOne).not.toHaveBeenCalled();
  });
});
