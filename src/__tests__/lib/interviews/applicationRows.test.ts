/**
 * @jest-environment node
 *
 * QA EMP-008 (2026-10-06): the interview list paged raw records and collapsed
 * rounds in the browser ("Showing 1–8 of 16" with 10 per page), and past
 * interviews stayed "Scheduled". listApplicationRows pages one row per
 * application and buckets on the latest round. Semantics were checked against
 * a real mongod on 2026-10-06; this pins the pipeline contract.
 */
const mockAggregate = jest.fn();
jest.mock("@/models/Interview", () => ({ __esModule: true, default: { aggregate: (...a: unknown[]) => mockAggregate(...a) } }));

import { listApplicationRows } from "@/lib/interviews/applicationRows";

const NOW = new Date("2026-10-06T10:00:00Z");
/** The $facet stage, wherever the pipeline puts it. */
const facetOf = (call: number) =>
  (mockAggregate.mock.calls[call][0] as Array<Record<string, unknown>>).find((st) => "$facet" in st)!.$facet as Record<string, Array<Record<string, unknown>>>;
const LEFT = ["selected", "offer", "hired", "rejected", "withdrawn"];

const run = (over: Partial<Parameters<typeof listApplicationRows>[0]> = {}) =>
  listApplicationRows({ match: { employerId: "e1" }, bucket: "", sortBy: "scheduledAt", sortOrder: 1, skip: 0, limit: 10, now: NOW, ...over });

beforeEach(() => {
  mockAggregate.mockReset();
  mockAggregate.mockResolvedValue([{
    rows: [{ ids: ["a2", "a1"] }, { ids: ["b1"] }],
    total: [{ n: 7 }],
    counts: [{ upcoming: 3, attention: 2, completed: 1, confirmed: 1, total: 7 }],
  }]);
});

it("returns page ids in row order with the application total and bucket counts", async () => {
  expect(await run()).toEqual({
    ids: ["a2", "a1", "b1"],
    total: 7,
    counts: { upcoming: 3, attention: 2, completed: 1, confirmed: 1, total: 7 },
  });
});

it("leaves superseded rescheduled records out unless the caller filtered status itself", async () => {
  await run();
  expect(mockAggregate.mock.calls[0][0][0]).toEqual({ $match: { employerId: "e1", status: { $ne: "rescheduled" } } });
  await run({ match: { employerId: "e1", status: { $nin: ["cancelled", "rescheduled"] } } });
  expect(mockAggregate.mock.calls[1][0][0]).toEqual({ $match: { employerId: "e1", status: { $nin: ["cancelled", "rescheduled"] } } });
});

it("groups by application keeping the latest round first", async () => {
  await run();
  const [, sort, group] = mockAggregate.mock.calls[0][0];
  expect(sort).toEqual({ $sort: { interviewRound: -1, scheduledAt: -1, createdAt: -1 } });
  expect(group.$group._id).toEqual({ $ifNull: ["$applicationId", "$_id"] });
  expect(group.$group.latest).toEqual({ $first: "$$ROOT" });
});

it("puts past, outcome-less interviews under attention, not upcoming", async () => {
  await run({ bucket: "attention" });
  const facet = facetOf(0);
  expect(facet.rows[0]).toEqual({
    $match: {
      $or: [
        { "latest.status": "cancelled", applicationStatus: { $nin: LEFT } },
        { "latest.status": { $in: ["scheduled", "confirmed"] }, "latest.scheduledAt": { $lt: NOW } },
      ],
    },
  });
  await run({ bucket: "upcoming" });
  expect(facetOf(1).rows[0]).toEqual({
    $match: { "latest.status": { $in: ["scheduled", "confirmed"] }, "latest.scheduledAt": { $gte: NOW } },
  });
});

it("pages after the bucket filter and only sorts on whitelisted fields", async () => {
  await run({ skip: 20, limit: 10, sortBy: "meetLink", sortOrder: -1 });
  const rows = facetOf(0).rows;
  expect(rows[1]).toEqual({ $sort: { "latest.scheduledAt": -1, _id: 1 } });
  expect(rows[2]).toEqual({ $skip: 20 });
  expect(rows[3]).toEqual({ $limit: 10 });
});

it("returns zeros for an empty result", async () => {
  mockAggregate.mockResolvedValue([{ rows: [], total: [], counts: [] }]);
  expect(await run()).toEqual({ ids: [], total: 0, counts: { upcoming: 0, attention: 0, completed: 0, confirmed: 0, total: 0 } });
});

/**
 * Rejecting, withdrawing or moving a candidate on cancels the slot they still
 * held (audit FUNC-009). That cancellation needs nothing from the employer, so
 * it must not sit under "Needs attention" asking them to rebook. A cancelled
 * round for a candidate still in the process stays there.
 */
it("leaves a cancelled round out of attention once the candidate has left the process", async () => {
  await run();
  const pipeline = mockAggregate.mock.calls[0][0] as Array<Record<string, unknown>>;
  const lookupAt = pipeline.findIndex((st) => "$lookup" in st);
  const facetAt = pipeline.findIndex((st) => "$facet" in st);
  // After grouping (the group key is the application id), before bucketing.
  expect(lookupAt).toBe(3);
  expect(pipeline[lookupAt].$lookup).toEqual({
    from: "applications",
    let: { applicationId: "$_id" },
    pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$applicationId"] } } }, { $project: { status: 1 } }],
    as: "application",
  });
  expect(pipeline[lookupAt + 1]).toEqual({ $set: { applicationStatus: { $arrayElemAt: ["$application.status", 0] } } });
  expect(facetAt).toBe(lookupAt + 2);

  // The tile counts the same rows the bucket filter returns.
  const attention = (facetOf(0).counts[0].$group as Record<string, unknown>).attention;
  expect(attention).toEqual({
    $sum: {
      $cond: [
        {
          $or: [
            {
              $and: [
                { $eq: ["$latest.status", "cancelled"] },
                { $not: [{ $in: [{ $ifNull: ["$applicationStatus", null] }, LEFT] }] },
              ],
            },
            { $and: [{ $in: ["$latest.status", ["scheduled", "confirmed"]] }, { $lt: ["$latest.scheduledAt", NOW] }] },
          ],
        },
        1,
        0,
      ],
    },
  });
});
