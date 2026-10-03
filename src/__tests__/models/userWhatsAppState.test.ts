/**
 * @jest-environment node
 */
import User from "@/models/User";

/**
 * Regression guard: the WhatsApp webhook writes `whatsapp.*` with `$set` and the
 * send gates read it. A path missing from the schema is stripped by Mongoose's
 * strict mode — the update "succeeds" and nothing is stored, so STOP would be
 * acknowledged but never honoured. Assert on the real schema.
 */
describe("User schema, WhatsApp channel state", () => {
  it.each([
    ["whatsapp.optInAt", "Date"],
    ["whatsapp.optOutAt", "Date"],
    ["whatsapp.lastInboundAt", "Date"],
    ["whatsapp.optInSource", "String"],
    ["whatsapp.waId", "String"],
    ["whatsapp.verifiedNumber", "String"],
    ["whatsapp.verifiedAt", "Date"],
    ["whatsapp.startCode", "String"],
  ])("declares %s as a %s", (path, instance) => {
    const schemaPath = User.schema.path(path);
    expect(schemaPath).toBeDefined();
    expect(schemaPath.instance).toBe(instance);
  });

  it("bounds the free-text fields", () => {
    expect(User.schema.path("whatsapp.optInSource").options.maxlength).toBe(60);
    expect(User.schema.path("whatsapp.waId").options.maxlength).toBe(32);
    expect(User.schema.path("whatsapp.verifiedNumber").options.maxlength).toBe(32);
    expect(User.schema.path("whatsapp.startCode").options.maxlength).toBe(6);
  });

  // The personal START code: unique across accounts that have one, skipping the many that never will (autoIndex is
  // off, so the schema declaration documents what ensureIndexes() builds).
  it("declares the START code unique among the accounts that hold one", () => {
    const declared = (User.schema.indexes() as [Record<string, unknown>, Record<string, unknown>][]).find(([key]) => JSON.stringify(key) === JSON.stringify({ "whatsapp.startCode": 1 }));
    expect(declared).toBeDefined();
    expect(declared![1]).toEqual(expect.objectContaining({ unique: true, partialFilterExpression: { "whatsapp.startCode": { $type: "string" } } }));
    expect(declared![1].sparse).toBeUndefined();
  });

  it("keeps every field when a document is built from the webhook's update shape", () => {
    const at = new Date("2026-09-29T10:00:00Z");
    const doc = new User({
      email: "sara@example.com",
      whatsapp: { optInAt: at, optInSource: "whatsapp_start", optOutAt: at, lastInboundAt: at, waId: "971501234567", verifiedNumber: "+971501234567", verifiedAt: at },
    });
    expect(doc.toObject().whatsapp).toEqual({ optInAt: at, optInSource: "whatsapp_start", optOutAt: at, lastInboundAt: at, waId: "971501234567", verifiedNumber: "+971501234567", verifiedAt: at });
  });

  it("does not invent the subdocument on a user who never used WhatsApp", () => {
    const doc = new User({ email: "sara@example.com" });
    expect(doc.whatsapp?.optOutAt).toBeUndefined();
    expect(doc.whatsapp?.lastInboundAt).toBeUndefined();
  });
});
