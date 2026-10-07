import mongoose, { type PipelineStage } from "mongoose";
import Interview from "@/models/Interview";

/**
 * The employer interview list shows ONE row per application — its latest
 * round — with earlier rounds as history. It used to page raw interview
 * records and collapse them in the browser, so a page of 10 showed 8 rows
 * under "Showing 1–8 of 16" (QA EMP-008, 2026-10-06). This pages by
 * application instead, so the pager, the tiles and the rows agree.
 *
 * Buckets are judged on the latest round, against the clock:
 *   upcoming  — scheduled/confirmed, still ahead
 *   attention — cancelled, or scheduled/confirmed but already past with no
 *               outcome recorded (these used to sit under "Scheduled" forever)
 *   completed / confirmed — that status
 * Superseded "rescheduled" records are never rows.
 */

export const ROW_BUCKETS = ["upcoming", "attention", "completed", "confirmed"] as const;
export type RowBucket = (typeof ROW_BUCKETS)[number];
export const ROW_SORT_FIELDS = ["scheduledAt", "createdAt"] as const;

const ACTIVE = ["scheduled", "confirmed"];

export interface RowCounts {
  upcoming: number;
  attention: number;
  completed: number;
  confirmed: number;
  total: number;
}

export interface ApplicationRowsResult {
  /** Interview ids for this page, latest round first within each application, in row order. */
  ids: mongoose.Types.ObjectId[];
  /** Applications matching every filter, bucket included. */
  total: number;
  /** Bucket sizes over every filter except the bucket. */
  counts: RowCounts;
}

function bucketMatch(bucket: string, now: Date): Record<string, unknown> {
  switch (bucket) {
    case "upcoming":
      return { "latest.status": { $in: ACTIVE }, "latest.scheduledAt": { $gte: now } };
    case "attention":
      return {
        $or: [
          { "latest.status": "cancelled" },
          { "latest.status": { $in: ACTIVE }, "latest.scheduledAt": { $lt: now } },
        ],
      };
    case "completed":
    case "confirmed":
      return { "latest.status": bucket };
    default:
      return {};
  }
}

export async function listApplicationRows(opts: {
  /** Scope + every non-bucket filter. Values must already be ObjectIds/Dates — $match does not cast. */
  match: Record<string, unknown>;
  bucket: string;
  sortBy: string;
  sortOrder: 1 | -1;
  skip: number;
  limit: number;
  now?: Date;
}): Promise<ApplicationRowsResult> {
  const now = opts.now ?? new Date();
  const sortField = (ROW_SORT_FIELDS as readonly string[]).includes(opts.sortBy) ? opts.sortBy : "scheduledAt";
  const match = "status" in opts.match ? opts.match : { ...opts.match, status: { $ne: "rescheduled" } };
  const isActive = { $in: ["$latest.status", ACTIVE] };

  const pipeline: PipelineStage[] = [
    { $match: match },
    { $sort: { interviewRound: -1, scheduledAt: -1, createdAt: -1 } },
    {
      $group: {
        _id: { $ifNull: ["$applicationId", "$_id"] },
        latest: { $first: "$$ROOT" },
        ids: { $push: "$_id" },
      },
    },
    {
      $facet: {
        rows: [
          { $match: bucketMatch(opts.bucket, now) },
          { $sort: { [`latest.${sortField}`]: opts.sortOrder, _id: 1 } },
          { $skip: opts.skip },
          { $limit: opts.limit },
          { $project: { ids: 1 } },
        ],
        total: [{ $match: bucketMatch(opts.bucket, now) }, { $count: "n" }],
        counts: [
          {
            $group: {
              _id: null,
              upcoming: { $sum: { $cond: [{ $and: [isActive, { $gte: ["$latest.scheduledAt", now] }] }, 1, 0] } },
              attention: {
                $sum: {
                  $cond: [
                    {
                      $or: [
                        { $eq: ["$latest.status", "cancelled"] },
                        { $and: [isActive, { $lt: ["$latest.scheduledAt", now] }] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
              completed: { $sum: { $cond: [{ $eq: ["$latest.status", "completed"] }, 1, 0] } },
              confirmed: { $sum: { $cond: [{ $eq: ["$latest.status", "confirmed"] }, 1, 0] } },
              total: { $sum: 1 },
            },
          },
        ],
      },
    },
  ];

  const [result] = (await Interview.aggregate(pipeline)) as Array<{
    rows: Array<{ ids: mongoose.Types.ObjectId[] }>;
    total: Array<{ n: number }>;
    counts: Array<Partial<RowCounts>>;
  }>;

  const c = result?.counts?.[0] ?? {};
  return {
    ids: (result?.rows ?? []).flatMap((r) => r.ids),
    total: result?.total?.[0]?.n ?? 0,
    counts: {
      upcoming: c.upcoming ?? 0,
      attention: c.attention ?? 0,
      completed: c.completed ?? 0,
      confirmed: c.confirmed ?? 0,
      total: c.total ?? 0,
    },
  };
}
