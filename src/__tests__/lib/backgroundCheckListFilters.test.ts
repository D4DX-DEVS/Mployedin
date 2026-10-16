/**
 * @jest-environment node
 *
 * Staff background-check list filters (owner request 2026-10-16): an agent
 * working with many employers narrows the list by employer, job, type, holder,
 * status and a name search — always ANDed with their scope, never widening it.
 */
import mongoose from "mongoose";

const mockEmployerFind = jest.fn();
const mockJobFind = jest.fn();
const mockSeekerFind = jest.fn();
const mockUserFind = jest.fn();
const chain = (rows: unknown[]) => ({ select: () => ({ limit: () => ({ lean: async () => rows }) }) });

jest.mock("@/models/Employer", () => ({ __esModule: true, default: { find: (...a: unknown[]) => mockEmployerFind(...a) } }));
jest.mock("@/models/Job", () => ({ __esModule: true, default: { find: (...a: unknown[]) => mockJobFind(...a) } }));
jest.mock("@/models/JobSeeker", () => ({ __esModule: true, default: { find: (...a: unknown[]) => mockSeekerFind(...a) } }));
jest.mock("@/models/User", () => ({ __esModule: true, default: { find: (...a: unknown[]) => mockUserFind(...a) } }));

import { buildStaffListFilter } from "@/lib/backgroundChecks/listFilters";

const ME = "651000000000000000000009";
const EMP = "651000000000000000000a01";
const OTHER_EMP = "651000000000000000000a02";
const JOB = "651000000000000000000c01";
const scope = { employerId: { $in: [EMP] } };
const params = (qs: string) => new URLSearchParams(qs);

beforeEach(() => {
  jest.clearAllMocks();
  mockEmployerFind.mockReturnValue(chain([{ _id: "e1" }]));
  mockJobFind.mockReturnValue(chain([{ _id: "j1" }]));
  mockSeekerFind.mockReturnValue(chain([{ _id: "s1" }]));
  mockUserFind.mockReturnValue(chain([]));
});

it("leaves the scope alone when nothing is filtered", async () => {
  expect(await buildStaffListFilter(scope, params(""), ME)).toEqual(scope);
});

it("ANDs an employer filter with the scope instead of replacing it", async () => {
  const filter = await buildStaffListFilter(scope, params(`employerId=${OTHER_EMP}`), ME);
  // The scope's employerId stays; the picked employer is an extra condition, so an out-of-scope id matches nothing.
  expect(filter.employerId).toEqual({ $in: [EMP] });
  expect(filter.$and).toEqual([{ employerId: new mongoose.Types.ObjectId(OTHER_EMP) }]);
});

it("filters by job, type and status", async () => {
  const filter = await buildStaffListFilter(scope, params(`jobId=${JOB}&checkType=reference&status=completed`), ME);
  expect(filter).toMatchObject({ checkType: "reference", status: "completed" });
  expect(filter.$and).toEqual([{ jobId: new mongoose.Types.ObjectId(JOB) }]);
});

it("treats awaiting_reply as running checks with referees and no reply yet", async () => {
  const filter = await buildStaffListFilter("all", params("status=awaiting_reply"), ME);
  expect(filter).toEqual({ status: "in_progress", "references.0": { $exists: true }, "references.status": { $ne: "responded" } });
});

it("treats open as not started or in progress", async () => {
  expect(await buildStaffListFilter("all", params("status=open"), ME)).toEqual({ status: { $in: ["pending", "in_progress"] } });
});

it("filters by who holds the check", async () => {
  const me = new mongoose.Types.ObjectId(ME);
  expect(await buildStaffListFilter("all", params("holder=me"), ME)).toEqual({ assignedTo: me });
  expect(await buildStaffListFilter("all", params("holder=unassigned"), ME)).toEqual({ assignedTo: null });
  expect(await buildStaffListFilter("all", params("holder=others"), ME)).toEqual({ assignedTo: { $nin: [null, me] } });
});

it("ignores values it doesn't know, including operator injection", async () => {
  const filter = await buildStaffListFilter(scope, params("status=%24ne&checkType=x&holder=boss&employerId=%7B%7D&jobId=nope"), ME);
  expect(filter).toEqual(scope);
});

it("searches candidate, employer and job names with an escaped pattern", async () => {
  const filter = await buildStaffListFilter(scope, params("q=a.c(me"), ME);
  expect(mockEmployerFind).toHaveBeenCalledWith({ companyName: { $regex: "a\\.c\\(me", $options: "i" } });
  expect(filter.$and).toEqual([
    { $or: [{ employerId: { $in: ["e1"] } }, { jobId: { $in: ["j1"] } }, { jobSeekerId: { $in: ["s1"] } }] },
  ]);
  expect(filter.employerId).toEqual({ $in: [EMP] });
});
