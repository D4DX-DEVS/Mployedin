/**
 * @jest-environment node
 */
import { NextRequest, NextResponse } from "next/server";

const logActivity = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
const actorFromCtx = jest.fn((..._a: unknown[]) => ({ userId: "u1", userRole: "job_seeker" }));
jest.mock("@/lib/audit/log", () => ({ logActivity: (...a: unknown[]) => logActivity(...a), actorFromCtx: (...a: unknown[]) => actorFromCtx(...a) }));
/** The signed-in person: a job seeker by default; a test can make them a company member, or staff inside tenant view. */
const who: { member?: { actorId: string; companyId: string }; tenantView: boolean } = { tenantView: false };
jest.mock("@/lib/auth/withAuth", () => ({
  // Mirrors the real wrapper: inside tenant view a route runs as the employer (userId swapped, tenantView set) unless it
  // opts out with skipTenantView; a company member's userId is swapped to the owner's, their own id in member.actorId.
  withAuth: (handler: (req: NextRequest, ctx: unknown) => Promise<Response>, guard?: { skipTenantView?: boolean }) => async (req: NextRequest) => {
    const ctx = who.tenantView && !guard?.skipTenantView
      ? { userId: "employer_user", role: "employer", locale: "en", tenantView: { actorId: "staff1", actorRole: "agent", employerId: "e1" } }
      : who.tenantView
        ? { userId: "staff1", role: "agent", locale: "en" }
        : who.member
          ? { userId: "owner1", role: "employer", locale: "en", member: who.member }
          : { userId: "u1", role: "job_seeker", locale: "en" };
    try { return await handler(req, ctx); } catch (err) { if (err instanceof NextResponse) return err; throw err; }
  },
}));
jest.mock("@/models/SystemConfig", () => ({ resolveDefaultDigestCadence: async () => "weekly" }));
let before: unknown = { categories: { interviews: { channels: ["in_app", "email"] } } };
let after: Record<string, unknown> = { categories: { interviews: { channels: ["in_app", "email", "whatsapp"] } } };
const findOne = jest.fn((..._args: unknown[]) => ({ select: () => ({ lean: async () => before }) }));
const findOneAndUpdate = jest.fn(async (..._args: unknown[]): Promise<unknown> => ({ toObject: () => after, ...after }));
const getOrCreatePreferences = jest.fn();
jest.mock("@/models/NotificationPreference", () => ({
  __esModule: true,
  default: {
    findOne: (...a: unknown[]) => findOne(...a),
    findOneAndUpdate: (...a: unknown[]) => findOneAndUpdate(...a),
  },
  getOrCreatePreferences: (...a: unknown[]) => getOrCreatePreferences(...a),
}));
/** The calling user's phone, verified number, STOP/START times and START code, as the GET reads them. */
let account: { phone?: string; whatsapp?: { verifiedNumber?: string; optInAt?: Date; optOutAt?: Date; startCode?: string } } | null = { phone: "+971 50 123 4567", whatsapp: { verifiedNumber: "+971501234567" } };
/** The number-level STOP list, read through the same helper every send uses. */
const isNumberSuppressed = jest.fn().mockResolvedValue(false);
jest.mock("@/models/WhatsAppSuppression", () => ({ __esModule: true, isNumberSuppressed: (...a: unknown[]) => isNumberSuppressed(...a) }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() } }));
const userSelect = jest.fn();
const userFindById = jest.fn((..._a: unknown[]) => ({ select: (...s: unknown[]) => { userSelect(...s); return { lean: async () => account }; } }));
jest.mock("@/models/User", () => ({ __esModule: true, default: { findById: (...a: unknown[]) => userFindById(...a) } }));
/** The account's personal START code (startCode.ts), and the link that types `START <code>`. */
const CODE = "K7P4QX";
const LINK = "https://wa.me/15551234567?text=START%20K7P4QX";
const linkFor = async (code: string) => `https://wa.me/15551234567?text=${encodeURIComponent(`START ${code}`)}`;
const getWhatsAppStartLink = jest.fn();
const ensureStartCode = jest.fn();
jest.mock("@/lib/communications/whatsapp/startLink", () => ({
  getWhatsAppStartLink: (...a: unknown[]) => getWhatsAppStartLink(...a),
  ensureStartCode: (...a: unknown[]) => ensureStartCode(...a),
}));
const record = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/communications/whatsapp/optIn", () => ({
  hasWhatsAppChannel: jest.requireActual("@/lib/communications/whatsapp/optIn").hasWhatsAppChannel,
  isWhatsAppReachable: jest.requireActual("@/lib/communications/whatsapp/optIn").isWhatsAppReachable,
  recordWhatsAppOptInChange: (...a: unknown[]) => record(...a),
}));

import { GET, PATCH } from "@/app/api/user/notification-preferences/route";

const routeCtx = { params: Promise.resolve({}) } as never;

const patch = (body: unknown) =>
  PATCH(new NextRequest("http://x/api/user/notification-preferences", { method: "PATCH", body: JSON.stringify(body), headers: { "content-type": "application/json", "x-forwarded-for": "9.9.9.9, 10.0.0.1" } }), routeCtx);

const WHATSAPP_ON = { categories: { interviews: { channels: ["in_app", "email", "whatsapp"] } } };
const WHATSAPP_OFF = { categories: { interviews: { channels: ["in_app", "email"] } } };
const ENABLE_WHATSAPP = { categories: { interviews: { enabled: true, channels: ["in_app", "email", "whatsapp"] } } };

beforeEach(() => {
  jest.clearAllMocks();
  before = WHATSAPP_OFF;
  after = WHATSAPP_ON;
  who.member = undefined;
  who.tenantView = false;
  account = { phone: "+971 50 123 4567", whatsapp: { verifiedNumber: "+971501234567" } };
  getWhatsAppStartLink.mockImplementation(linkFor);
  ensureStartCode.mockResolvedValue(CODE);
  isNumberSuppressed.mockResolvedValue(false);
});

describe("PATCH /api/user/notification-preferences — WhatsApp consent", () => {
  // The recorder treats an enable as a preference only (optIn.ts); the route hands it every transition.
  it("hands the first WhatsApp enable to the recorder with the client IP", async () => {
    const res = await patch({ categories: { interviews: { enabled: true, channels: ["in_app", "email", "whatsapp"] } } });
    expect(res.status).toBe(200);
    expect(record).toHaveBeenCalledWith({ userId: "u1", before: false, after: true, source: "notification_settings", ipAddress: "9.9.9.9" });
  });
  it("still calls the recorder (which no-ops) when nothing changed", async () => {
    before = after;
    await patch({ categories: { interviews: { enabled: true, channels: ["in_app", "email", "whatsapp"] } } });
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ before: true, after: true }));
  });
  it("reports a categories save that leaves WhatsApp off as no change", async () => {
    after = WHATSAPP_OFF;
    const res = await patch({ categories: { jobs: { enabled: false } } });
    expect(res.status).toBe(200);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ before: false, after: false }));
  });
  it("skips the pre-image read and the recorder when the body has no categories", async () => {
    after = WHATSAPP_OFF;
    const res = await patch({ emailFrequency: "daily" });
    expect(res.status).toBe(200);
    expect(findOne).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });
  it("treats a user with no preferences document yet as not opted in", async () => {
    before = null;
    await patch({ categories: { interviews: { enabled: true, channels: ["in_app", "whatsapp"] } } });
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ before: false, after: true }));
  });
  it("records the removal of the last WhatsApp channel as a withdrawal", async () => {
    before = WHATSAPP_ON;
    after = WHATSAPP_OFF;
    await patch({ categories: { interviews: { enabled: true, channels: ["in_app", "email"] } } });
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ before: true, after: false }));
  });
  it("omits the IP when the request carries no forwarded address", async () => {
    await PATCH(new NextRequest("http://x/api/user/notification-preferences", { method: "PATCH", body: JSON.stringify(ENABLE_WHATSAPP), headers: { "content-type": "application/json" } }), routeCtx);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ ipAddress: undefined }));
  });
});

// A settings tab left open sends its whole snapshot. If the user replied STOP
// meanwhile, that snapshot still lists whatsapp; saving it would put the channel
// back (before=false, after=true) and the recorder would stamp a fresh optInAt,
// reversing the STOP and logging a consent the user never gave.
describe("PATCH /api/user/notification-preferences — stale snapshot guard", () => {
  const STORED = "2026-10-02T10:00:00.000Z";
  const STALE = "2026-10-02T09:00:00.000Z";

  it("answers 409 stale_preferences and writes nothing when the stored copy is newer", async () => {
    before = { ...WHATSAPP_OFF, updatedAt: new Date(STORED) };
    const res = await patch({ ...ENABLE_WHATSAPP, expectedUpdatedAt: STALE });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ success: false, error: "stale_preferences" });
    expect(findOneAndUpdate).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
  });
  it("also guards a save that carries no categories", async () => {
    before = { ...WHATSAPP_OFF, updatedAt: new Date(STORED) };
    const res = await patch({ emailFrequency: "daily", expectedUpdatedAt: STALE });
    expect(res.status).toBe(409);
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });
  it("saves when the stored copy is the one the client loaded, and ties the write to that stamp", async () => {
    before = { ...WHATSAPP_OFF, updatedAt: new Date(STORED) };
    const res = await patch({ ...ENABLE_WHATSAPP, expectedUpdatedAt: STORED });
    expect(res.status).toBe(200);
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { userId: "u1", updatedAt: { $lte: new Date(STORED) } },
      { $set: expect.any(Object) },
      { returnDocument: "after", upsert: false },
    );
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ before: false, after: true }));
  });
  it("answers 409 when the document changes between the check and the write", async () => {
    before = { ...WHATSAPP_OFF, updatedAt: new Date(STORED) };
    findOneAndUpdate.mockResolvedValueOnce(null);
    const res = await patch({ ...ENABLE_WHATSAPP, expectedUpdatedAt: STORED });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ success: false, error: "stale_preferences" });
    expect(record).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
  });
  it("behaves as before when the client sends no stamp", async () => {
    before = { ...WHATSAPP_OFF, updatedAt: new Date(STORED) };
    const res = await patch(ENABLE_WHATSAPP);
    expect(res.status).toBe(200);
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { userId: "u1" },
      { $set: expect.any(Object) },
      { returnDocument: "after", upsert: true },
    );
  });
  it("saves, and still upserts, when there is no stored document or stamp to compare", async () => {
    before = null;
    const res = await patch({ ...ENABLE_WHATSAPP, expectedUpdatedAt: STALE });
    expect(res.status).toBe(200);
    expect(findOneAndUpdate).toHaveBeenCalledWith({ userId: "u1" }, { $set: expect.any(Object) }, { returnDocument: "after", upsert: true });
  });
  it("rejects a stamp that is not an ISO date", async () => {
    const res = await patch({ ...ENABLE_WHATSAPP, expectedUpdatedAt: "yesterday" });
    expect(res.status).toBe(400);
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });
  it("hands the new stamp back on a successful save", async () => {
    after = { ...WHATSAPP_ON, updatedAt: "2026-10-02T10:05:00.000Z" };
    const res = await patch({ ...ENABLE_WHATSAPP, expectedUpdatedAt: STORED });
    const json = await res.json();
    expect(json.data.updatedAt).toBe("2026-10-02T10:05:00.000Z");
  });
});

// The settings pages show whether WhatsApp messages can reach the user: only once a START from the number
// on their profile has verified it (verification.ts), with a wa.me link to send that START. Since 10-03 the START
// carries the account's own code, so the GET also hands the page that code (and creates it on first need).
describe("GET /api/user/notification-preferences — WhatsApp verification", () => {
  const get = async () => {
    getOrCreatePreferences.mockResolvedValue({ toObject: () => ({ emailFrequency: "daily" }) });
    const res = await GET(new NextRequest("http://x/api/user/notification-preferences"), routeCtx);
    expect(res.status).toBe(200);
    return res.json();
  };

  it("reports a verified number and the last 4 digits for the masked note; a verified account gets no code and no link", async () => {
    expect((await get()).whatsappVerification).toEqual({ verified: true, waLink: null, phoneLast4: "4567", phoneValid: true, startCode: null });
    expect(userFindById).toHaveBeenCalledWith("u1");
    // The same STOP-list read every send makes.
    expect(isNumberSuppressed).toHaveBeenCalledWith("+971501234567");
    // A verified account needs no code: none is created.
    expect(ensureStartCode).not.toHaveBeenCalled();
    expect(getWhatsAppStartLink).not.toHaveBeenCalled();
  });

  it("gives an unverified account with a valid phone its code, and the link that types START and the code", async () => {
    account = { phone: "+971501234567", whatsapp: {} };
    expect((await get()).whatsappVerification).toEqual({ verified: false, waLink: LINK, phoneLast4: "4567", phoneValid: true, startCode: CODE });
    expect(ensureStartCode).toHaveBeenCalledWith("u1");
    expect(getWhatsAppStartLink).toHaveBeenCalledWith(CODE);
  });

  it("reuses the code the account already has, without creating one", async () => {
    account = { phone: "+971501234567", whatsapp: { startCode: "AB23CD" } };
    const { whatsappVerification } = await get();
    expect(whatsappVerification.startCode).toBe("AB23CD");
    expect(whatsappVerification.waLink).toBe("https://wa.me/15551234567?text=START%20AB23CD");
    expect(ensureStartCode).not.toHaveBeenCalled();
  });

  it("answers with no code and no link, and still returns the preferences, when the code cannot be created", async () => {
    account = { phone: "+971501234567", whatsapp: {} };
    ensureStartCode.mockResolvedValue(null);
    const json = await get();
    expect(json.whatsappVerification).toEqual({ verified: false, waLink: null, phoneLast4: "4567", phoneValid: true, startCode: null });
    expect(getWhatsAppStartLink).not.toHaveBeenCalled();
    expect(json.data.emailFrequency).toBe("daily");
  });

  // F1: STOP leaves verifiedNumber in place, but every send then skips as opted_out. "Verified" would be false,
  // and the panel must show the START instructions instead.
  it("reports not verified after a STOP on the account, although the number stays on record", async () => {
    account = { phone: "+971501234567", whatsapp: { verifiedNumber: "+971501234567", optInAt: new Date("2026-10-01T09:00:00Z"), optOutAt: new Date("2026-10-02T09:00:00Z") } };
    expect((await get()).whatsappVerification).toEqual({ verified: false, waLink: LINK, phoneLast4: "4567", phoneValid: true, startCode: CODE });
  });

  it("reports verified again once a START newer than the STOP has come in", async () => {
    account = { phone: "+971501234567", whatsapp: { verifiedNumber: "+971501234567", optInAt: new Date("2026-10-02T10:00:00Z") } };
    expect((await get()).whatsappVerification.verified).toBe(true);
  });

  it("reports not verified while the number is on the STOP list (its account opt-out gone), with the code to send", async () => {
    isNumberSuppressed.mockResolvedValue(true);
    const { whatsappVerification } = await get();
    expect(whatsappVerification.verified).toBe(false);
    expect(whatsappVerification.startCode).toBe(CODE);
  });

  it("reports not verified, and still answers, when the STOP list cannot be read", async () => {
    isNumberSuppressed.mockRejectedValue(new Error("db down"));
    const json = await get();
    expect(json.whatsappVerification.verified).toBe(false);
    expect(json.data.emailFrequency).toBe("daily");
  });

  // F6: a phone with no country code can never be dialled or verified; the panel says so instead of offering START.
  it("reports a phone it cannot normalise as not valid, with no more of it than the last 4 digits, and no code", async () => {
    account = { phone: "050 123 4567", whatsapp: {} };
    const json = await get();
    expect(json.whatsappVerification).toEqual({ verified: false, waLink: null, phoneLast4: "4567", phoneValid: false, startCode: null });
    expect(JSON.stringify(json)).not.toContain("0501234567");
    // A START can never verify that phone, so no code is created for it.
    expect(ensureStartCode).not.toHaveBeenCalled();
  });

  it("does not hand back a stored code while the phone cannot be verified", async () => {
    account = { phone: "050 123 4567", whatsapp: { startCode: "AB23CD" } };
    expect((await get()).whatsappVerification.startCode).toBeNull();
  });

  it("reports not verified when the START came from another number than the one on the profile", async () => {
    account = { phone: "+971501234567", whatsapp: { verifiedNumber: "+971507654321" } };
    expect((await get()).whatsappVerification.verified).toBe(false);
  });

  it("reports no phone when the profile has none, with no code", async () => {
    account = { whatsapp: { verifiedNumber: "+971501234567" } };
    expect((await get()).whatsappVerification).toEqual({ verified: false, waLink: null, phoneLast4: null, phoneValid: false, startCode: null });
    expect(ensureStartCode).not.toHaveBeenCalled();
  });

  it("answers with a null link but still the code in mock mode or when Meta cannot be reached, and still returns the preferences", async () => {
    account = { phone: "+971501234567", whatsapp: {} };
    getWhatsAppStartLink.mockResolvedValue(null);
    const json = await get();
    expect(json.whatsappVerification).toEqual({ verified: false, waLink: null, phoneLast4: "4567", phoneValid: true, startCode: CODE });
    expect(json.data.emailFrequency).toBe("daily");
  });

  it("reads the phone, the verified number, the STOP/START times and the code only, of the signed-in person (a company member's own)", async () => {
    who.member = { actorId: "member1", companyId: "c1" };
    account = { phone: "+971501234567", whatsapp: {} };
    await get();
    expect(userFindById).toHaveBeenCalledWith("member1");
    expect(userSelect).toHaveBeenCalledWith("phone whatsapp.verifiedNumber whatsapp.optInAt whatsapp.optOutAt whatsapp.startCode");
    // The code is the member's own, never the company owner's.
    expect(ensureStartCode).toHaveBeenCalledWith("member1");
    expect(ensureStartCode).not.toHaveBeenCalledWith("owner1");
  });

  it("never sends the full number or the verified number to the page", async () => {
    const json = await get();
    expect(JSON.stringify(json)).not.toContain("971501234567");
  });
});

describe("GET /api/user/notification-preferences — version stamp", () => {
  it("returns updatedAt so a page can send it back as expectedUpdatedAt", async () => {
    getOrCreatePreferences.mockResolvedValue({ toObject: () => ({ emailFrequency: "daily", updatedAt: "2026-10-02T10:00:00.000Z" }) });
    const res = await GET(new NextRequest("http://x/api/user/notification-preferences"), routeCtx);
    expect((await res.json()).data.updatedAt).toBe("2026-10-02T10:00:00.000Z");
  });
});

// The route serves the signed-in person's own preferences, and records their own
// consent. A company member's ctx.userId is the owner's id (withAuth swaps it so
// employer lookups resolve the company), and tenant view swaps it to the employer.
describe("whose preferences: always the signed-in person's own", () => {
  const userIdsWritten = () => [...findOne.mock.calls, ...findOneAndUpdate.mock.calls].map((c) => (c[0] as { userId: string }).userId);

  it("a company member's PATCH changes the member's preferences and records the member's consent, never the owner's", async () => {
    who.member = { actorId: "member1", companyId: "c1" };
    const res = await patch(ENABLE_WHATSAPP);
    expect(res.status).toBe(200);
    expect(userIdsWritten()).toEqual(["member1", "member1"]);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ userId: "member1", before: false, after: true }));
    // Audited as the member's own act, not one done on the owner's behalf.
    expect(actorFromCtx).toHaveBeenCalledWith({ userId: "member1", role: "employer" });
  });

  it("a company member's GET reads the member's preferences", async () => {
    who.member = { actorId: "member1", companyId: "c1" };
    getOrCreatePreferences.mockResolvedValue({ toObject: () => ({ emailFrequency: "daily" }) });
    await GET(new NextRequest("http://x/api/user/notification-preferences"), routeCtx);
    expect(getOrCreatePreferences).toHaveBeenCalledWith("member1");
  });

  it("is never run as the employer inside tenant view: staff cannot read or change the employer's preferences or forge its consent", async () => {
    who.tenantView = true;
    getOrCreatePreferences.mockResolvedValue({ toObject: () => ({ emailFrequency: "daily" }) });
    await GET(new NextRequest("http://x/api/user/notification-preferences"), routeCtx);
    await patch(ENABLE_WHATSAPP);
    expect(getOrCreatePreferences).not.toHaveBeenCalledWith("employer_user");
    expect(userIdsWritten()).not.toContain("employer_user");
    expect(record).not.toHaveBeenCalledWith(expect.objectContaining({ userId: "employer_user" }));
    // skipTenantView: the request runs as the staff member, on their own preferences.
    expect(getOrCreatePreferences).toHaveBeenCalledWith("staff1");
    expect(userIdsWritten()).toEqual(["staff1", "staff1"]);
  });

  it("a plain user still acts on their own id", async () => {
    await patch(ENABLE_WHATSAPP);
    expect(userIdsWritten()).toEqual(["u1", "u1"]);
    expect(actorFromCtx).toHaveBeenCalledWith({ userId: "u1", role: "job_seeker" });
  });
});
