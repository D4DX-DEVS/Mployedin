import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import SavedJob from "@/models/SavedJob";
import { seekerProfileId } from "@/lib/savedJobs/seeker";

// The sizes PaginationControls offers.
const PAGE_SIZES = [10, 25, 50, 100];

/**
 * GET /api/saved-jobs?page=1&limit=20 — the caller's saved jobs, newest first.
 * A job deleted since it was saved has nothing to show, so it is left out of
 * the page and the total.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "job_seeker") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const requested = Number(searchParams.get("limit"));
  const limit = PAGE_SIZES.includes(requested) ? requested : 10;

  await connectDB();
  const jobSeekerId = await seekerProfileId(ctx.userId);
  if (!jobSeekerId) return NextResponse.json({ items: [], total: 0, page, totalPages: 0 });

  const pipeline = [
    { $match: { jobSeekerId } },
    { $lookup: { from: "jobs", localField: "jobId", foreignField: "_id", as: "job", pipeline: [{ $match: { deletedAt: null } }] } },
    { $unwind: "$job" },
  ];
  const [rows, counted] = await Promise.all([
    SavedJob.aggregate([
      ...pipeline,
      { $sort: { savedAt: -1, _id: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
      {
        $lookup: {
          from: "employers",
          localField: "job.employerId",
          foreignField: "_id",
          as: "employer",
          pipeline: [{ $project: { companyName: 1, logo: 1 } }],
        },
      },
      {
        $project: {
          _id: 0,
          savedAt: 1,
          job: {
            _id: "$job._id",
            title: "$job.title",
            status: "$job.status",
            createdAt: "$job.createdAt",
            expiresAt: "$job.expiresAt",
            employmentType: "$job.employmentType",
            location: "$job.location",
            salary: "$job.salary",
            requirements: { skills: "$job.requirements.skills" },
            employerId: { $first: "$employer" },
          },
        },
      },
    ]),
    SavedJob.aggregate<{ total: number }>([...pipeline, { $count: "total" }]),
  ]);
  const total = counted[0]?.total ?? 0;

  return NextResponse.json({ items: rows, total, page, totalPages: Math.ceil(total / limit) });
});
