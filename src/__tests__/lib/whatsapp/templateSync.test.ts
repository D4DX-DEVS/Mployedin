/**
 * @jest-environment node
 */
export {};

const listTemplates = jest.fn();
jest.mock("@/lib/communications/whatsapp/cloudApi", () => ({ listTemplates: (...a: unknown[]) => listTemplates(...a) }));
const bulkWrite = jest.fn().mockResolvedValue({ upsertedCount: 2, modifiedCount: 0 });
const updateMany = jest.fn().mockResolvedValue({ modifiedCount: 1 });
const deleteMany = jest.fn().mockResolvedValue({ deletedCount: 0 });
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));
jest.mock("@/models/WhatsAppTemplate", () => ({
  __esModule: true,
  default: {
    bulkWrite: (...a: unknown[]) => bulkWrite(...a),
    updateMany: (...a: unknown[]) => updateMany(...a),
    deleteMany: (...a: unknown[]) => deleteMany(...a),
  },
}));

import logger from "@/lib/logger";
import { describeBody, syncTemplatesFromMeta } from "@/lib/communications/whatsapp/templateSync";

type Op = { updateOne: { filter: unknown; update: { $set: Record<string, unknown>; $unset?: Record<string, unknown> }; upsert: boolean } };

beforeEach(() => jest.clearAllMocks());

describe("describeBody", () => {
  it("counts positional parameters", () => {
    expect(describeBody([{ type: "HEADER", format: "TEXT", text: "Update" }, { type: "BODY", text: "Hi {{1}}, {{2}} Open MPLOYEDIN." }])).toEqual({
      bodyText: "Hi {{1}}, {{2}} Open MPLOYEDIN.", bodyParamCount: 2, bodyParamNames: [], headerFormat: "TEXT",
    });
  });
  it("lists named parameters", () => {
    expect(describeBody([{ type: "BODY", text: "Hi {{first_name}}, {{update}}" }])).toEqual({
      bodyText: "Hi {{first_name}}, {{update}}", bodyParamCount: 2, bodyParamNames: ["first_name", "update"], headerFormat: undefined,
    });
  });
  it("handles a template without a body", () => {
    expect(describeBody(undefined)).toEqual({ bodyText: "", bodyParamCount: 0, bodyParamNames: [], headerFormat: undefined });
  });
  it("takes the highest positional index, and counts a repeated named parameter once", () => {
    expect(describeBody([{ type: "BODY", text: "{{1}} then {{3}} then {{1}}" }]).bodyParamCount).toBe(3);
    expect(describeBody([{ type: "BODY", text: "{{name}} and {{name}}" }])).toEqual(
      expect.objectContaining({ bodyParamCount: 1, bodyParamNames: ["name"] }),
    );
  });
  it("accepts lower-case component types and spaces inside the braces", () => {
    expect(describeBody([{ type: "body", text: "Hi {{ 1 }}" }]).bodyParamCount).toBe(1);
  });
});

describe("syncTemplatesFromMeta", () => {
  it("upserts every template by Meta id and retires the ones Meta no longer lists", async () => {
    listTemplates.mockResolvedValue([
      { id: "1", name: "mployedin_application_status", language: "en", status: "APPROVED", category: "UTILITY", components: [{ type: "BODY", text: "Hi {{1}}, {{2}}" }], quality_score: { score: "GREEN" } },
      { id: "2", name: "mployedin_application_status", language: "ar", status: "REJECTED", category: "UTILITY", components: [{ type: "BODY", text: "مرحباً {{1}}، {{2}}" }], rejected_reason: "INVALID_FORMAT" },
    ]);
    const res = await syncTemplatesFromMeta();
    expect(res).toEqual({ total: 2, upserted: 2, retired: 1 });
    const ops = bulkWrite.mock.calls[0][0] as Op[];
    expect(ops).toHaveLength(2);
    expect(ops[0].updateOne.filter).toEqual({ metaId: "1" });
    expect(ops[0].updateOne.update.$set).toEqual(expect.objectContaining({ name: "mployedin_application_status", language: "en", status: "APPROVED", category: "UTILITY", bodyParamCount: 2, qualityScore: "GREEN" }));
    expect(ops[1].updateOne.update.$set).toEqual(expect.objectContaining({ status: "REJECTED", rejectedReason: "INVALID_FORMAT" }));
    expect(updateMany).toHaveBeenCalledWith({ metaId: { $nin: ["1", "2"] }, status: { $ne: "DELETED" } }, { $set: { status: "DELETED" } });
  });

  it("upserts rather than only updating, and writes unordered", async () => {
    listTemplates.mockResolvedValue([{ id: "1", name: "a", language: "en", status: "APPROVED", category: "UTILITY" }]);
    await syncTemplatesFromMeta();
    expect((bulkWrite.mock.calls[0][0] as Op[])[0].updateOne.upsert).toBe(true);
    expect(bulkWrite.mock.calls[0][1]).toEqual({ ordered: false });
  });

  it("treats Meta's rejected_reason NONE as no reason, and clears fields Meta no longer reports", async () => {
    listTemplates.mockResolvedValue([{ id: "1", name: "a", language: "en", status: "APPROVED", category: "UTILITY", components: [{ type: "BODY", text: "Hi" }], rejected_reason: "NONE" }]);
    await syncTemplatesFromMeta();
    const update = (bulkWrite.mock.calls[0][0] as Op[])[0].updateOne.update;
    // A template rejected earlier and approved since must not keep the old reason.
    expect(update.$set).not.toHaveProperty("rejectedReason");
    expect(update.$unset).toEqual({ rejectedReason: "", qualityScore: "", headerFormat: "" });
  });

  it("keeps the optional fields Meta does report out of $unset", async () => {
    listTemplates.mockResolvedValue([
      { id: "1", name: "a", language: "en", status: "APPROVED", category: "UTILITY", components: [{ type: "HEADER", format: "TEXT", text: "Hi" }, { type: "BODY", text: "Hi" }], quality_score: { score: "GREEN" } },
    ]);
    await syncTemplatesFromMeta();
    const update = (bulkWrite.mock.calls[0][0] as Op[])[0].updateOne.update;
    expect(update.$set).toEqual(expect.objectContaining({ headerFormat: "TEXT", qualityScore: "GREEN" }));
    expect(update.$unset).toEqual({ rejectedReason: "" });
  });

  it("makes room for a re-created template: a row with the same name and language but another Meta id is removed first", async () => {
    listTemplates.mockResolvedValue([
      { id: "9", name: "a", language: "en", status: "PENDING", category: "UTILITY" },
      { id: "2", name: "b", language: "ar", status: "APPROVED", category: "UTILITY" },
    ]);
    const order: string[] = [];
    deleteMany.mockImplementationOnce(async () => { order.push("deleteMany"); return { deletedCount: 1 }; });
    bulkWrite.mockImplementationOnce(async () => { order.push("bulkWrite"); return {}; });
    await syncTemplatesFromMeta();
    expect(deleteMany).toHaveBeenCalledWith({
      $or: [
        { name: "a", language: "en", metaId: { $ne: "9" } },
        { name: "b", language: "ar", metaId: { $ne: "2" } },
      ],
    });
    // The unique (name, language) index would reject the upsert while the old row is still there.
    expect(order).toEqual(["deleteMany", "bulkWrite"]);
  });

  it("with nothing listed it writes nothing and retires nothing (an empty answer is more likely a wrong WABA or a glitch), and warns", async () => {
    listTemplates.mockResolvedValue([]);
    const res = await syncTemplatesFromMeta();
    expect(bulkWrite).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
    expect(res).toEqual({ total: 0, upserted: 0, retired: 0 });
    expect(logger.warn).toHaveBeenCalledWith("[whatsapp] template sync: Meta listed no templates, so none were retired");
  });

  it("propagates a Graph failure and changes nothing", async () => {
    listTemplates.mockRejectedValue(new Error("Graph down"));
    await expect(syncTemplatesFromMeta()).rejects.toThrow("Graph down");
    expect(bulkWrite).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });
});
