/** @jest-environment node */

const findOneAndUpdate = jest.fn();
const deleteOne = jest.fn();

jest.mock("mongoose", () => {
  const Schema = jest.fn();
  return {
    __esModule: true,
    default: { models: {}, model: () => ({
      findOneAndUpdate: (...a: unknown[]) => findOneAndUpdate(...a),
      deleteOne: (...a: unknown[]) => deleteOne(...a),
    }) },
    Schema,
  };
});

import { acquireLease, releaseLease } from "@/lib/db/lease";

beforeEach(() => jest.clearAllMocks());

describe("acquireLease", () => {
  it("claims a free or expired lease via an upsert keyed on _id", async () => {
    findOneAndUpdate.mockResolvedValue({});
    await expect(acquireLease("job:1", 60_000)).resolves.toBe(true);
    const [filter, update, opts] = findOneAndUpdate.mock.calls[0];
    expect(filter._id).toBe("job:1");
    expect(filter.expiresAt.$lte).toBeInstanceOf(Date);
    expect(update.$set.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(opts).toEqual({ upsert: true });
  });

  it("reports a live lease held elsewhere as not acquired (duplicate _id)", async () => {
    findOneAndUpdate.mockRejectedValue(Object.assign(new Error("E11000"), { code: 11000 }));
    await expect(acquireLease("job:1", 60_000)).resolves.toBe(false);
  });

  it("rethrows other database errors", async () => {
    findOneAndUpdate.mockRejectedValue(new Error("network"));
    await expect(acquireLease("job:1", 60_000)).rejects.toThrow("network");
  });

  it("releases by key", async () => {
    deleteOne.mockResolvedValue({});
    await releaseLease("job:1");
    expect(deleteOne).toHaveBeenCalledWith({ _id: "job:1" });
  });
});
