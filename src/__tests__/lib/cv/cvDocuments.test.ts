/**
 * @jest-environment node
 *
 * Which CV an application is scored on, and when a seeker's file may be
 * deleted: never while an application that was sent with it exists.
 */

const chain = (value: unknown) => {
  const q = { select: () => q, lean: () => Promise.resolve(value) };
  return q;
};

const cvFindOne = jest.fn();
const cvFindOneAndUpdate = jest.fn();
const cvDeleteOne = jest.fn().mockResolvedValue({ deletedCount: 1 });
const cvFind = jest.fn();
jest.mock("@/models/CvDocument", () => ({
  __esModule: true,
  default: {
    findOne: (...a: unknown[]) => cvFindOne(...a),
    findOneAndUpdate: (...a: unknown[]) => cvFindOneAndUpdate(...a),
    deleteOne: (...a: unknown[]) => cvDeleteOne(...a),
    find: (...a: unknown[]) => cvFind(...a),
  },
}));
const appExists = jest.fn();
jest.mock("@/models/Application", () => ({ __esModule: true, default: { exists: (...a: unknown[]) => appExists(...a) } }));
const send = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/inngest/client", () => ({ inngest: { send: (...a: unknown[]) => send(...a) } }));
const deleteFile = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/storage/spaces", () => ({ deleteFile: (...a: unknown[]) => deleteFile(...a) }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));

import { applicantCvFor, applicantCvsFor, cvStatusesFor, registerCvDocument, releaseSeekerFile, CV_PROCESS_EVENT } from "@/lib/cv/cvDocuments";

const SEEKER = "seeker1";
const SENT = "https://cdn/cvs/january.pdf";
const PROFILE = "https://cdn/cvs/march.pdf";

beforeEach(() => jest.clearAllMocks());

describe("applicantCvFor", () => {
  it("uses the resume sent with the application, not the newer profile CV", async () => {
    cvFindOne.mockReturnValue(chain({ status: "processed", fileName: "january.pdf", text: "jan text", parsed: { skills: ["CRM"] } }));
    const cv = await applicantCvFor({
      jobSeekerId: SEEKER,
      documents: [{ name: "Cover", url: "c", type: "other" }, { name: "CV", url: SENT, type: "resume" }],
      profileCvUrl: PROFILE,
    });
    expect(cvFindOne).toHaveBeenCalledWith({ jobSeekerId: SEEKER, fileUrl: SENT });
    expect(cv).toMatchObject({ state: "read", fileName: "january.pdf", text: "jan text" });
    expect(cv.parsed?.skills).toEqual(["CRM"]);
  });

  it("falls back to the profile CV for an application sent without one", async () => {
    cvFindOne.mockReturnValue(chain({ status: "failed" }));
    const cv = await applicantCvFor({ jobSeekerId: SEEKER, documents: [], profileCvUrl: PROFILE });
    expect(cvFindOne).toHaveBeenCalledWith({ jobSeekerId: SEEKER, fileUrl: PROFILE });
    expect(cv.state).toBe("unreadable");
  });

  it("is 'none' when there is no CV at all, without touching the database", async () => {
    await expect(applicantCvFor({ jobSeekerId: SEEKER, documents: null, profileCvUrl: null })).resolves.toEqual({ state: "none" });
    expect(cvFindOne).not.toHaveBeenCalled();
  });

  it("registers and queues a file uploaded before CVs were read", async () => {
    cvFindOne.mockReturnValue(chain(null));
    cvFindOneAndUpdate.mockReturnValue(chain({ _id: "new1", status: "uploaded" }));
    const cv = await applicantCvFor({
      jobSeekerId: SEEKER,
      documents: [{ name: "Antony_CV.pdf", url: SENT, type: "resume" }],
    });
    expect(cv).toEqual({ state: "reading" });
    const [filter, update] = cvFindOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ jobSeekerId: SEEKER, fileUrl: SENT });
    expect(update.$setOnInsert).toMatchObject({ fileName: "Antony_CV.pdf", source: "application", status: "uploaded" });
    expect(send).toHaveBeenCalledWith([{ name: CV_PROCESS_EVENT, data: { cvDocumentId: "new1", jobSeekerId: SEEKER } }]);
  });

  it("never fails a score over one CV's bookkeeping", async () => {
    cvFindOne.mockReturnValue(chain(null));
    cvFindOneAndUpdate.mockReturnValue({ select: () => ({ lean: () => Promise.reject(new Error("db blip")) }) });
    await expect(applicantCvFor({ jobSeekerId: SEEKER, profileCvUrl: PROFILE })).resolves.toEqual({ state: "reading" });
  });
});

describe("applicantCvsFor", () => {
  it("loads a whole batch's CVs in one query and keeps each application's own file", async () => {
    cvFind.mockReturnValue(
      chain([
        { jobSeekerId: SEEKER, fileUrl: SENT, status: "processed", text: "jan text", parsed: {} },
        { jobSeekerId: "seeker2", fileUrl: PROFILE, status: "failed" },
        // Another seeker's copy of the same URL must not be used for seeker1.
        { jobSeekerId: "seeker3", fileUrl: SENT, status: "failed" },
      ]),
    );
    cvFindOneAndUpdate.mockReturnValue(chain({ _id: "new3", status: "uploaded" }));

    const cvs = await applicantCvsFor([
      { jobSeekerId: SEEKER, documents: [{ url: SENT, type: "resume" }], profileCvUrl: PROFILE },
      { jobSeekerId: "seeker2", documents: [], profileCvUrl: PROFILE },
      { jobSeekerId: "seeker4", documents: [], profileCvUrl: null },
      { jobSeekerId: "seeker5", documents: [{ url: "https://cdn/cvs/new.pdf", type: "resume" }] },
    ]);

    expect(cvFind).toHaveBeenCalledTimes(1);
    expect(cvFindOne).not.toHaveBeenCalled();
    expect(cvs.map((cv) => cv.state)).toEqual(["read", "unreadable", "none", "reading"]);
    expect(cvs[0].text).toBe("jan text");
    // Only the unseen file is registered.
    expect(cvFindOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(cvFindOneAndUpdate.mock.calls[0][0]).toEqual({ jobSeekerId: "seeker5", fileUrl: "https://cdn/cvs/new.pdf" });
  });

  it("skips the query when no application has a CV", async () => {
    await expect(applicantCvsFor([{ jobSeekerId: SEEKER }])).resolves.toEqual([{ state: "none" }]);
    expect(cvFind).not.toHaveBeenCalled();
  });
});

describe("registerCvDocument", () => {
  it("does not queue a file that has been read already", async () => {
    cvFindOneAndUpdate.mockReturnValue(chain({ _id: "old1", status: "processed" }));
    await expect(registerCvDocument({ jobSeekerId: SEEKER, fileUrl: SENT, source: "profile" })).resolves.toEqual({ id: "old1", status: "processed" });
    expect(send).not.toHaveBeenCalled();
  });

  it("survives two requests registering the same file at once", async () => {
    cvFindOneAndUpdate.mockReturnValue({
      select: () => ({ lean: () => Promise.reject(Object.assign(new Error("dup"), { code: 11000 })) }),
    });
    cvFindOne.mockReturnValue(chain({ _id: "won1", status: "uploaded" }));
    await expect(registerCvDocument({ jobSeekerId: SEEKER, fileUrl: SENT, source: "profile" })).resolves.toEqual({ id: "won1", status: "uploaded" });
  });

  it("never fails the upload when the queue is down", async () => {
    cvFindOneAndUpdate.mockReturnValue(chain({ _id: "new2", status: "uploaded" }));
    send.mockRejectedValueOnce(new Error("queue down"));
    await expect(registerCvDocument({ jobSeekerId: SEEKER, fileUrl: SENT, source: "profile" })).resolves.toEqual({ id: "new2", status: "uploaded" });
  });
});

describe("releaseSeekerFile", () => {
  it("keeps a file an application was sent with", async () => {
    appExists.mockResolvedValue({ _id: "app1" });
    await expect(releaseSeekerFile(SEEKER, SENT)).resolves.toBe(false);
    expect(appExists).toHaveBeenCalledWith({ jobSeekerId: SEEKER, "documents.url": SENT });
    expect(deleteFile).not.toHaveBeenCalled();
    expect(cvDeleteOne).not.toHaveBeenCalled();
  });

  it("deletes a file no application uses, and its CV record", async () => {
    appExists.mockResolvedValue(null);
    await expect(releaseSeekerFile(SEEKER, SENT)).resolves.toBe(true);
    expect(deleteFile).toHaveBeenCalledWith(SENT);
    expect(cvDeleteOne).toHaveBeenCalledWith({ jobSeekerId: SEEKER, fileUrl: SENT });
  });
});

describe("cvStatusesFor", () => {
  it("maps each file to its reading state", async () => {
    cvFind.mockReturnValue(chain([
      { fileUrl: SENT, status: "processed" },
      { fileUrl: PROFILE, status: "failed", error: "unreadable" },
    ]));
    const map = await cvStatusesFor(SEEKER, [SENT, PROFILE]);
    expect(map.get(SENT)).toEqual({ status: "processed" });
    expect(map.get(PROFILE)).toEqual({ status: "failed", error: "unreadable" });
    await expect(cvStatusesFor(SEEKER, [])).resolves.toEqual(new Map());
  });
});
