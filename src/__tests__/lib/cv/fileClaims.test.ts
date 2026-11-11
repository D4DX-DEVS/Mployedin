/**
 * @jest-environment node
 *
 * A file must not be deleted while an application is being saved with it.
 * Applying in one tab while the CV is replaced or deleted in another used to
 * leave the application pointing at a deleted file: releaseSeekerFile checked
 * "is it in an application?" and then deleted, and the application could be
 * saved in between. Both sides now meet on the seeker's record (fileClaims.ts).
 */
const updateOne = jest.fn();
const findOneAndUpdate = jest.fn();
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    updateOne: (...a: unknown[]) => updateOne(...a),
    findOneAndUpdate: (...a: unknown[]) => ({ lean: () => findOneAndUpdate(...a) }),
  },
}));
const releaseSeekerFile = jest.fn().mockResolvedValue(true);
jest.mock("@/lib/cv/cvDocuments", () => ({ releaseSeekerFile: (...a: unknown[]) => releaseSeekerFile(...a) }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { warn: jest.fn(), error: jest.fn(), info: jest.fn() } }));

import {
  CLAIM_HOLD_MS,
  claimSeekerFiles,
  isClaimHeld,
  releaseUnlessClaimed,
  removeSeekerDocuments,
} from "@/lib/cv/fileClaims";

const SEEKER = "650000000000000000000500";
const DOC = "https://cdn/documents/resume.pdf";
const PROFILE = "https://cdn/cvs/profile.pdf";

beforeEach(() => {
  jest.clearAllMocks();
  updateOne.mockResolvedValue({ matchedCount: 0 });
});

describe("claimSeekerFiles", () => {
  it("stamps an uploaded document on the seeker's own record, without touching updatedAt", async () => {
    updateOne.mockResolvedValueOnce({ matchedCount: 1 });
    expect(await claimSeekerFiles(SEEKER, [DOC])).toEqual([]);
    const [filter, update, options] = updateOne.mock.calls[0];
    expect(filter).toEqual({ _id: SEEKER, "documents.url": DOC });
    expect(update.$set["documents.$.attachedAt"]).toBeInstanceOf(Date);
    // strict: false so a process on an older schema cannot drop the stamp.
    expect(options).toEqual({ timestamps: false, strict: false });
  });

  it("stamps the Profile CV when the address is not an uploaded document", async () => {
    updateOne.mockResolvedValueOnce({ matchedCount: 0 }).mockResolvedValueOnce({ matchedCount: 1 });
    expect(await claimSeekerFiles(SEEKER, [PROFILE])).toEqual([]);
    expect(updateOne.mock.calls[1][0]).toEqual({ _id: SEEKER, "cv.originalUrl": PROFILE });
    expect(updateOne.mock.calls[1][1].$set["cv.attachedAt"]).toBeInstanceOf(Date);
  });

  it("reports a file removed since it was read", async () => {
    expect(await claimSeekerFiles(SEEKER, [DOC])).toEqual([DOC]);
  });

  it("claims each address once and has nothing to do for none", async () => {
    updateOne.mockResolvedValue({ matchedCount: 1 });
    await claimSeekerFiles(SEEKER, [DOC, DOC, ""]);
    expect(updateOne).toHaveBeenCalledTimes(1);
    expect(await claimSeekerFiles(SEEKER, [])).toEqual([]);
  });
});

describe("isClaimHeld", () => {
  const now = Date.parse("2026-11-11T12:00:00Z");
  it("holds a fresh claim and lets an old or absent one go", () => {
    expect(isClaimHeld(new Date(now - 5_000), now)).toBe(true);
    expect(isClaimHeld(new Date(now - CLAIM_HOLD_MS - 1), now)).toBe(false);
    expect(isClaimHeld(undefined, now)).toBe(false);
    expect(isClaimHeld("not a date", now)).toBe(false);
  });
});

describe("removeSeekerDocuments", () => {
  it("takes the documents off in one write and reads them as they were", async () => {
    findOneAndUpdate.mockResolvedValue({ documents: [{ id: "a", url: DOC }, { id: "keep", url: "https://cdn/x.pdf" }] });
    const removed = await removeSeekerDocuments(SEEKER, ["a"]);
    const [filter, update, options] = findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ _id: SEEKER });
    expect(update).toEqual({ $pull: { documents: { id: { $in: ["a"] } } } });
    expect(options).toMatchObject({ new: false });
    expect(removed).toEqual([{ id: "a", url: DOC }]);
    expect(releaseSeekerFile).toHaveBeenCalledWith(SEEKER, DOC);
    expect(releaseSeekerFile).toHaveBeenCalledTimes(1);
  });

  it("keeps the file of a document an application is being saved with right now", async () => {
    // The claim landed first: the record as it was carries the stamp.
    findOneAndUpdate.mockResolvedValue({ documents: [{ id: "a", url: DOC, attachedAt: new Date() }] });
    await removeSeekerDocuments(SEEKER, ["a"]);
    expect(releaseSeekerFile).not.toHaveBeenCalled();
  });

  it("releases a file claimed long ago — whether an application has it is releaseSeekerFile's to check", async () => {
    findOneAndUpdate.mockResolvedValue({ documents: [{ id: "a", url: DOC, attachedAt: new Date(Date.now() - CLAIM_HOLD_MS - 60_000) }] });
    await removeSeekerDocuments(SEEKER, ["a"]);
    expect(releaseSeekerFile).toHaveBeenCalledWith(SEEKER, DOC);
  });

  it("does nothing for no ids, and survives a storage failure", async () => {
    expect(await removeSeekerDocuments(SEEKER, [])).toEqual([]);
    expect(findOneAndUpdate).not.toHaveBeenCalled();

    findOneAndUpdate.mockResolvedValue({ documents: [{ id: "a", url: DOC }] });
    releaseSeekerFile.mockRejectedValueOnce(new Error("storage down"));
    await expect(removeSeekerDocuments(SEEKER, ["a"])).resolves.toHaveLength(1);
  });
});

describe("releaseUnlessClaimed", () => {
  it("keeps a held Profile CV and releases one that is not held", async () => {
    await releaseUnlessClaimed(SEEKER, { url: PROFILE, attachedAt: new Date() });
    expect(releaseSeekerFile).not.toHaveBeenCalled();
    await releaseUnlessClaimed(SEEKER, { url: PROFILE });
    expect(releaseSeekerFile).toHaveBeenCalledWith(SEEKER, PROFILE);
  });
});

describe("the two sides, in either order", () => {
  // A tiny stand-in for the seeker's record, applying writes one at a time as
  // MongoDB does to a single document.
  function record() {
    let docs: Array<{ id: string; url: string; attachedAt?: Date }> = [{ id: "a", url: DOC }];
    updateOne.mockImplementation(async (filter: Record<string, string>, update: { $set: Record<string, Date> }) => {
      const hit = docs.find((d) => d.url === filter["documents.url"]);
      if (!hit) return { matchedCount: 0 };
      hit.attachedAt = update.$set["documents.$.attachedAt"];
      return { matchedCount: 1 };
    });
    findOneAndUpdate.mockImplementation(async () => {
      const before = { documents: docs.map((d) => ({ ...d })) };
      docs = docs.filter((d) => d.id !== "a");
      return before;
    });
  }

  it("claim first: the application may be saved, and the file is kept", async () => {
    record();
    const missing = await claimSeekerFiles(SEEKER, [DOC]);
    await removeSeekerDocuments(SEEKER, ["a"]);
    expect(missing).toEqual([]);
    expect(releaseSeekerFile).not.toHaveBeenCalled();
  });

  it("removal first: the file goes, and the application is refused", async () => {
    record();
    await removeSeekerDocuments(SEEKER, ["a"]);
    const missing = await claimSeekerFiles(SEEKER, [DOC]);
    expect(releaseSeekerFile).toHaveBeenCalledWith(SEEKER, DOC);
    expect(missing).toEqual([DOC]);
  });
});
