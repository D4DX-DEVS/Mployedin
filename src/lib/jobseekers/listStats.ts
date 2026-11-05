import type { PipelineStage } from "mongoose";

/**
 * The three numbers the agent's Job Seekers page heads its list with, counted
 * over the whole filtered list rather than the page of rows on screen.
 *
 * The rules match what the page used to count in the browser:
 * - complete: profileCompleteness of 80 or more (missing counts as 0)
 * - avgCompleteness: mean profileCompleteness, missing counted as 0, rounded
 * - withTitles: the FIRST current job (`experience[].isCurrent`) has a
 *   non-empty title — the same entry the row's Title column shows
 */
export interface SeekerListStats {
  complete: number;
  avgCompleteness: number;
  withTitles: number;
}

/** Pipeline stages appended after a `$match` (or inside a `$facet`). */
export const SEEKER_LIST_STATS_STAGES: PipelineStage.FacetPipelineStage[] = [
  {
    $group: {
      _id: null,
      complete: {
        $sum: { $cond: [{ $gte: [{ $ifNull: ["$profileCompleteness", 0] }, 80] }, 1, 0] },
      },
      avgCompleteness: { $avg: { $ifNull: ["$profileCompleteness", 0] } },
      withTitles: {
        $sum: {
          $let: {
            vars: {
              current: {
                $arrayElemAt: [
                  {
                    $filter: {
                      input: { $ifNull: ["$experience", []] },
                      as: "e",
                      cond: { $eq: ["$$e.isCurrent", true] },
                    },
                  },
                  0,
                ],
              },
            },
            in: {
              $cond: [
                {
                  $and: [
                    { $eq: [{ $type: "$$current.jobTitle" }, "string"] },
                    { $ne: ["$$current.jobTitle", ""] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    },
  },
];

interface StatsRow {
  complete?: number | null;
  avgCompleteness?: number | null;
  withTitles?: number | null;
}

/** The `$group` output (absent when no seeker matched) as the response field. */
export function readSeekerListStats(row: StatsRow | undefined): SeekerListStats {
  return {
    complete: row?.complete ?? 0,
    avgCompleteness: Math.round(row?.avgCompleteness ?? 0),
    withTitles: row?.withTitles ?? 0,
  };
}
