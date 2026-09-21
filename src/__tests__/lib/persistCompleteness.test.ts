/**
 * @jest-environment node
 *
 * `recomputeCompleteness` is the only part of the completeness feature that
 * touches Mongo. Its job is to keep the stored figure equal to what the formula
 * says about the document *as it stands now* — and, just as importantly, never
 * to write a figure derived from something that is not the seeker's document.
 */
const findOne = jest.fn((..._a: unknown[]) => ({ lean: async () => null as unknown }));
const updateOne = jest.fn(async (..._a: unknown[]) => ({ acknowledged: true }));

jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    findOne: (...a: unknown[]) => findOne(...a),
    updateOne: (...a: unknown[]) => updateOne(...a),
  },
}));

import { recomputeCompleteness } from "@/lib/jobSeeker/persistCompleteness";

const lean = (doc: unknown) => ({ lean: async () => doc });
const USER = "64b000000000000000000001";

beforeEach(() => {
  findOne.mockReset();
  findOne.mockReturnValue({ lean: async () => null });
  updateOne.mockClear();
});

describe("recomputeCompleteness", () => {
  it("scores the document it is handed and persists the result", async () => {
    const score = await recomputeCompleteness(USER, {
      userId: USER,
      education: [{ degree: "B.Com" }],
    });
    expect(score).toBe(25);
    expect(updateOne).toHaveBeenCalledWith({ userId: USER }, { $set: { profileCompleteness: 25 } });
    expect(findOne).not.toHaveBeenCalled();
  });

  it("unwraps a hydrated mongoose document", async () => {
    const score = await recomputeCompleteness(USER, {
      toObject: () => ({ userId: USER, skills: ["welding"] }),
    });
    expect(score).toBe(30);
  });

  it("re-reads when given nothing", async () => {
    findOne.mockReturnValue(lean({ userId: USER, skills: ["welding"] }));
    expect(await recomputeCompleteness(USER)).toBe(30);
    expect(findOne).toHaveBeenCalledWith({ userId: USER });
  });

  it("re-reads rather than trusting a doc with no userId", async () => {
    // A driver that hands back a write result instead of the record would
    // otherwise score 0 and persist it — the very drift this module prevents.
    findOne.mockReturnValue(lean({ userId: USER, skills: ["welding"] }));
    expect(await recomputeCompleteness(USER, { acknowledged: true } as never)).toBe(30);
    expect(findOne).toHaveBeenCalled();
    expect(updateOne).toHaveBeenCalledWith({ userId: USER }, { $set: { profileCompleteness: 30 } });
  });

  it("writes nothing when the seeker cannot be resolved at all", async () => {
    findOne.mockReturnValue(lean(null));
    expect(await recomputeCompleteness(USER, {} as never)).toBeNull();
    expect(updateOne).not.toHaveBeenCalled();
  });

  it("never fails the caller's save when the write throws", async () => {
    updateOne.mockRejectedValueOnce(new Error("mongo down"));
    await expect(recomputeCompleteness(USER, { userId: USER })).resolves.toBeNull();
  });
});
