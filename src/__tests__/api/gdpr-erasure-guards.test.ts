/**
 * @jest-environment node
 *
 * GD-2: erasure needs a fresh password for credentials accounts, and the last
 * active admin cannot erase themselves.
 */
import { NextRequest } from "next/server";

const USER_ID = "64e000000000000000000001";
let role = "job_seeker";

jest.mock("@/lib/gdpr/redactMessages", () => ({ redactUserMessages: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/audit/log", () => ({ actorFromCtx: jest.fn(() => ({})), logActivity: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/security/rateLimit", () => ({ checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }) }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown) => Promise<Response>) =>
    (req: NextRequest) => handler(req, { userId: USER_ID, role, locale: "en" }),
}));
jest.mock("@/lib/storage/spaces", () => ({ deleteFile: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/cv/cvDocuments", () => ({ deleteCvRecordsOfSeeker: jest.fn().mockResolvedValue(undefined) }));
const deactivateEmployerAccount = jest.fn().mockResolvedValue({ employerId: "e1", affectedJobs: 2 });
jest.mock("@/lib/employers/accountStatus", () => ({
  deactivateEmployerAccount: (...a: unknown[]) => deactivateEmployerAccount(...a),
}));

const comparePassword = jest.fn();
const countDocuments = jest.fn().mockResolvedValue(0);
const findByIdAndUpdate = jest.fn().mockResolvedValue(undefined);
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    findById: jest.fn(() => ({
      select: jest.fn().mockResolvedValue({ _id: USER_ID, role, passwordHash: "hash", comparePassword }),
    })),
    countDocuments: (...a: unknown[]) => countDocuments(...a),
    findByIdAndUpdate: (...a: unknown[]) => findByIdAndUpdate(...a),
  },
}));
const leanNull = () => ({ select: () => ({ lean: () => Promise.resolve(null) }) });
jest.mock("@/models/JobSeeker", () => ({ __esModule: true, default: { findOneAndUpdate: jest.fn(leanNull) } }));
jest.mock("@/models/Application", () => ({ __esModule: true, default: { find: jest.fn(), updateMany: jest.fn() } }));
jest.mock("@/models/Interview", () => ({ __esModule: true, default: { find: jest.fn() } }));
// Cookie-consent proof: listed on export, unlinked from the account on erasure.
jest.mock("@/models/CookieConsentRecord", () => {
  const chain = { select: () => chain, sort: () => chain, limit: () => chain, lean: () => Promise.resolve([]) };
  return { __esModule: true, default: { find: jest.fn(() => chain), updateMany: jest.fn().mockResolvedValue({}) } };
});
jest.mock("@/models/Notification", () => ({ __esModule: true, default: { deleteMany: jest.fn().mockResolvedValue(undefined) } }));
jest.mock("@/models/GdprRequest", () => ({ __esModule: true, default: { create: jest.fn().mockResolvedValue({}) } }));
const employerUpdateOne = jest.fn().mockResolvedValue({});
jest.mock("@/models/Employer", () => ({ __esModule: true, default: { updateOne: (...a: unknown[]) => employerUpdateOne(...a) } }));
jest.mock("@/models/Agent", () => ({ __esModule: true, default: { updateOne: jest.fn().mockResolvedValue({}) } }));
jest.mock("@/models/SuperAgent", () => ({ __esModule: true, default: { updateOne: jest.fn().mockResolvedValue({}) } }));

const erase = async (body?: unknown) => {
  const { DELETE } = await import("@/app/api/gdpr/export/route");
  return DELETE(
    new NextRequest("http://localhost/api/gdpr/export", {
      method: "DELETE",
      ...(body ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}),
    }),
    { params: Promise.resolve({}) },
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  role = "job_seeker";
  comparePassword.mockResolvedValue(true);
  countDocuments.mockResolvedValue(0);
});

it("requires a password for a credentials account", async () => {
  const res = await erase();
  expect(res.status).toBe(400);
  expect(findByIdAndUpdate).not.toHaveBeenCalled();
});

it("rejects a wrong password", async () => {
  comparePassword.mockResolvedValue(false);
  const res = await erase({ password: "nope" });
  expect(res.status).toBe(403);
  expect(findByIdAndUpdate).not.toHaveBeenCalled();
});

it("refuses to erase the last active admin", async () => {
  role = "admin";
  const res = await erase({ password: "right" });
  expect(res.status).toBe(409);
  expect(findByIdAndUpdate).not.toHaveBeenCalled();
});

it("an employer's erasure takes their jobs off the market", async () => {
  role = "employer";
  const res = await erase({ password: "right" });
  expect(res.status).toBe(200);
  expect(deactivateEmployerAccount).toHaveBeenCalledWith(USER_ID);
  const [, update] = findByIdAndUpdate.mock.calls[0];
  expect(update.$unset).toMatchObject({ phone: 1, avatar: 1 });
});
