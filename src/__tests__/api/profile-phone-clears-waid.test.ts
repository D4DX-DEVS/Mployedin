/**
 * @jest-environment node
 *
 * A WhatsApp STOP is matched on the number a user typed and on the `wa_id` Meta
 * returned for it (`whatsapp.waId`). Nothing else clears the wa_id, so a user
 * who changes `User.phone` would keep a wa_id that belongs to the old number,
 * and a message from that old number would still reach their account. The
 * consent belongs to the old number too: kept, it would let anyone opt in once
 * and then point the account at someone else's number. Every route that writes
 * `User.phone` therefore resets that state first (forgetWaIdOnPhoneChange), and
 * only when the stored phone is another value.
 */
import { NextRequest } from "next/server";

const USER = "651000000000000000000001";
const NEW_PHONE = "+971 50 765 4321";
/** The number stored before the save: another number, so the reset applies. */
const OLD_PHONE = "+971501234567";
const mockCtx = { role: "agent" };

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown) => Promise<Response>) => (req: NextRequest) =>
    handler(req, { userId: USER, role: mockCtx.role, locale: "en" }),
}));
jest.mock("@/lib/db/mongoose", () => ({ __esModule: true, default: jest.fn(async () => undefined), connectDB: jest.fn(async () => undefined) }));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn(async () => undefined), actorFromCtx: jest.fn(() => ({})) }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { warn: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock("@/lib/agents/assignedRegion", () => ({ regionLocale: jest.fn(), resolveAssignedRegions: jest.fn(async () => []) }));
jest.mock("@/lib/cv/cvDocuments", () => ({ deleteCvRecordsOfSeeker: jest.fn(async () => undefined) }));
const eraseWhatsAppData = jest.fn(async (..._a: unknown[]) => undefined);
jest.mock("@/lib/gdpr/erasure", () => ({ eraseWhatsAppData: (...a: unknown[]) => eraseWhatsAppData(...a) }));

/** What `Model.find…(…).select(…).lean()` and `.select(…).lean()` after an update resolve to. */
const chain = (value: unknown) => {
  const node: Record<string, unknown> = {};
  node.select = jest.fn(() => node);
  node.lean = jest.fn(async () => value);
  return node;
};

/** The phone-change reset; it hands back the account as it was: opted in on the old number. */
const userReset = jest.fn((..._a: unknown[]) => chain({ name: "Sara", whatsapp: { optInAt: new Date("2026-10-01T09:00:00Z") } }));
const userFindByIdAndUpdate = jest.fn((..._a: unknown[]) => chain({}));
/** The reset reads the stored phone (`select("phone")`): the old number. Any other read sees the saved account. */
const userFindById = jest.fn((..._a: unknown[]) => {
  const node: Record<string, unknown> = {};
  let fields = "";
  node.select = jest.fn((f: string) => {
    fields = f;
    return node;
  });
  node.lean = jest.fn(async () => (fields === "phone" ? { phone: OLD_PHONE } : { name: "Sara", phone: NEW_PHONE }));
  return node;
});
const prefUpdateOne = jest.fn(async (..._a: unknown[]) => ({ modifiedCount: 1 }));
jest.mock("@/models/NotificationPreference", () => ({
  __esModule: true,
  default: { updateOne: (...a: unknown[]) => prefUpdateOne(...a) },
  CATEGORY_KEYS: ["applications", "interviews"],
}));
const consentCreate = jest.fn(async (..._a: unknown[]) => ({}));
jest.mock("@/models/ConsentLog", () => ({ __esModule: true, default: { create: (...a: unknown[]) => consentCreate(...a) } }));
jest.mock("@/models/User", () => {
  const model = {
    findOneAndUpdate: (...a: unknown[]) => userReset(...a),
    findByIdAndUpdate: (...a: unknown[]) => userFindByIdAndUpdate(...a),
    findById: (...a: unknown[]) => userFindById(...a),
  };
  return { __esModule: true, default: model, User: model };
});
jest.mock("@/models/Agent", () => ({ __esModule: true, default: { findOne: () => chain({ commissionRate: 5 }) } }));
jest.mock("@/models/SuperAgent", () => ({ __esModule: true, default: { findOne: () => chain({ overrideRate: 2, commissions: {} }) } }));
jest.mock("@/models/Territory", () => ({ __esModule: true, default: { findOne: () => chain(null) } }));
const seekerFindOneAndUpdate = jest.fn();
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    findOneAndUpdate: (...a: unknown[]) => seekerFindOneAndUpdate(...a),
    updateOne: jest.fn(async () => ({})),
  },
}));

/** Compare and set on the phone the reset read and judged another number (waId.ts). */
const PHONE_FILTER = { _id: USER, phone: OLD_PHONE };
const FORGET = { $unset: { "whatsapp.waId": 1, "whatsapp.optInAt": 1, "whatsapp.lastInboundAt": 1, "whatsapp.verifiedNumber": 1, "whatsapp.verifiedAt": 1, "whatsapp.startCode": 1 } };
const BEFORE = { returnDocument: "before" };
/** The rest of the reset: WhatsApp off in every category, and the withdrawn consent on record. */
const consentReset = () => {
  expect(prefUpdateOne).toHaveBeenCalledWith({ userId: USER }, { $pull: { "categories.applications.channels": "whatsapp", "categories.interviews.channels": "whatsapp" } });
  expect(consentCreate).toHaveBeenCalledWith(expect.objectContaining({ userId: USER, consentType: "whatsapp_messaging", granted: false, source: "phone_changed" }));
};

function patchReq(url: string, body: Record<string, unknown>) {
  return new NextRequest(url, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}
const routeCtx = { params: Promise.resolve({}) };
/** The WhatsApp state is reset before the User update that changes the phone, never after. */
const forgottenBeforeSave = () => expect(userReset.mock.invocationCallOrder[0]).toBeLessThan(userFindByIdAndUpdate.mock.invocationCallOrder[0]);

beforeEach(() => {
  jest.clearAllMocks();
  seekerFindOneAndUpdate.mockResolvedValue({ toObject: () => ({}) });
});

describe("PATCH /api/agent/profile", () => {
  beforeEach(() => {
    mockCtx.role = "agent";
  });

  it("resets the WhatsApp state (wa_id, consent, window), before the save, when the phone is sent", async () => {
    const { PATCH } = await import("@/app/api/agent/profile/route");
    const res = await PATCH(patchReq("http://localhost/api/agent/profile", { phone: NEW_PHONE }), routeCtx);
    expect(res.status).toBe(200);
    expect(userReset).toHaveBeenCalledWith(PHONE_FILTER, FORGET, BEFORE);
    consentReset();
    expect(userFindByIdAndUpdate).toHaveBeenCalledWith(USER, { $set: { phone: NEW_PHONE } }, expect.anything());
    forgottenBeforeSave();
  });

  it("leaves the WhatsApp state alone when only the name is saved", async () => {
    const { PATCH } = await import("@/app/api/agent/profile/route");
    await PATCH(patchReq("http://localhost/api/agent/profile", { name: "Sara Ali" }), routeCtx);
    expect(userFindByIdAndUpdate).toHaveBeenCalled();
    expect(userReset).not.toHaveBeenCalled();
    expect(consentCreate).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/super-agent/profile", () => {
  beforeEach(() => {
    mockCtx.role = "super_agent";
  });

  it("resets the WhatsApp state (wa_id, consent, window), before the save, when the phone is sent", async () => {
    const { PATCH } = await import("@/app/api/super-agent/profile/route");
    const res = await PATCH(patchReq("http://localhost/api/super-agent/profile", { phone: NEW_PHONE }), routeCtx);
    expect(res.status).toBe(200);
    expect(userReset).toHaveBeenCalledWith(PHONE_FILTER, FORGET, BEFORE);
    consentReset();
    expect(userFindByIdAndUpdate).toHaveBeenCalledWith(USER, { $set: { phone: NEW_PHONE } }, expect.anything());
    forgottenBeforeSave();
  });

  it("leaves the WhatsApp state alone when only the name is saved", async () => {
    const { PATCH } = await import("@/app/api/super-agent/profile/route");
    await PATCH(patchReq("http://localhost/api/super-agent/profile", { name: "Sara Ali" }), routeCtx);
    expect(userFindByIdAndUpdate).toHaveBeenCalled();
    expect(userReset).not.toHaveBeenCalled();
    expect(consentCreate).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/job-seeker/profile", () => {
  const call = async (body: Record<string, unknown>) => {
    const { patchHandler } = await import("@/app/api/job-seeker/profile/handlers");
    return patchHandler(patchReq("http://localhost/api/job-seeker/profile", body), { userId: USER, role: "job_seeker", locale: "en" });
  };

  it("resets the WhatsApp state (wa_id, consent, window), before the save, when the phone is sent", async () => {
    const res = await call({ phone: NEW_PHONE });
    expect(res.status).toBe(200);
    expect(userReset).toHaveBeenCalledWith(PHONE_FILTER, FORGET, BEFORE);
    consentReset();
    expect(userFindByIdAndUpdate).toHaveBeenCalledWith(USER, { phone: NEW_PHONE }, expect.anything());
    forgottenBeforeSave();
  });

  it("leaves the WhatsApp state alone when the save carries no phone", async () => {
    await call({ name: "Sara Ali", headline: "Accountant" });
    expect(userFindByIdAndUpdate).toHaveBeenCalled();
    expect(userReset).not.toHaveBeenCalled();
    expect(consentCreate).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/job-seekers/account", () => {
  const erase = async () => {
    mockCtx.role = "job_seeker";
    seekerFindOneAndUpdate.mockReturnValue(chain({ _id: "js1" }));
    const { DELETE } = await import("@/app/api/job-seekers/account/route");
    return DELETE(new NextRequest("http://localhost/api/job-seekers/account", { method: "DELETE" }), routeCtx);
  };

  it("erases the WhatsApp data with the admin erasure's own helper, before the phone it is found by is nulled", async () => {
    const res = await erase();
    expect(res.status).toBe(200);
    expect(eraseWhatsAppData).toHaveBeenCalledWith(USER);
    const update = userFindByIdAndUpdate.mock.calls[0][1] as Record<string, unknown>;
    expect(update.phone).toBeNull();
    // The helper unsets the whole whatsapp subdocument; no partial copy of it here.
    expect(update).not.toHaveProperty("$unset");
    expect(eraseWhatsAppData.mock.invocationCallOrder[0]).toBeLessThan(userFindByIdAndUpdate.mock.invocationCallOrder[0]);
  });

  it("fails the erasure, with nothing anonymised yet, when the WhatsApp part fails (a retry still has the number)", async () => {
    eraseWhatsAppData.mockRejectedValueOnce(new Error("db down"));
    const res = await erase();
    expect(res.status).toBe(500);
    expect(userFindByIdAndUpdate).not.toHaveBeenCalled();
  });
});
