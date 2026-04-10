import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { checkRateLimitDual } from "@/lib/security/rateLimit";
import User from "@/models/User";
import mongoose from "mongoose";
import type { UserRole } from "@/models/User";

interface AuthCtx {
  userId: string;
  role: UserRole;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * GET /api/users/search?q=<query>
 *
 * LinkedIn-style user search with ranking:
 *   score 5 — exact match on name
 *   score 4 — name starts with query
 *   score 3 — headline or companyName match
 *   score 1 — contains anywhere
 *
 * Returns max 20 results. Rate limited 20 req/min.
 */
async function handler(req: NextRequest, ctx: AuthCtx) {
  // Rate limit: 20/min per user
  const rl = checkRateLimitDual(req, ctx.userId, {
    limit: 20,
    windowSec: 60,
    prefix: "user-search",
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  const url = new URL(req.url);
  const rawQuery = url.searchParams.get("q") ?? "";
  const normalized = rawQuery.trim().toLowerCase();

  if (!normalized || normalized.length < 2) {
    return NextResponse.json({ users: [] });
  }

  await connectDB();

  const safe = escapeRegex(normalized);
  const currentUserId = new mongoose.Types.ObjectId(ctx.userId);

  // Determine which roles the current user can search for
  // Employers search job seekers; job seekers search employers; admins/agents search all
  const searchableRoles: string[] = [];
  if (ctx.role === "employer") {
    searchableRoles.push("job_seeker");
  } else if (ctx.role === "job_seeker") {
    searchableRoles.push("employer");
  } else {
    // admin, agent, super_agent can search everyone
    searchableRoles.push("employer", "job_seeker");
  }

  const pipeline: mongoose.PipelineStage[] = [
    // Stage 1: filter active users, exclude self, match searchable roles
    {
      $match: {
        _id: { $ne: currentUserId },
        isActive: true,
        lockUntil: { $not: { $gt: new Date() } },
        role: { $in: searchableRoles },
        // Pre-filter: name must at least contain the query (regex on indexed field)
        name: { $regex: safe, $options: "i" },
      },
    },

    // Stage 2: Rank by match quality
    {
      $addFields: {
        _searchScore: {
          $switch: {
            branches: [
              // Exact match on name (case-insensitive via $toLower)
              {
                case: { $eq: [{ $toLower: "$name" }, normalized] },
                then: 5,
              },
              // Name starts with query
              {
                case: {
                  $regexMatch: {
                    input: "$name",
                    regex: `^${safe}`,
                    options: "i",
                  },
                },
                then: 4,
              },
            ],
            default: 1,
          },
        },
      },
    },

    // Stage 3: Sort by score descending, then alphabetical
    { $sort: { _searchScore: -1, name: 1 } },

    // Stage 4: Limit results
    { $limit: 20 },

    // Stage 5: Lookup JobSeeker headline
    {
      $lookup: {
        from: "jobseekers",
        localField: "_id",
        foreignField: "userId",
        as: "_jobSeeker",
        pipeline: [{ $project: { headline: 1 } }],
      },
    },

    // Stage 6: Lookup Employer companyName + logo
    {
      $lookup: {
        from: "employers",
        localField: "_id",
        foreignField: "userId",
        as: "_employer",
        pipeline: [{ $project: { companyName: 1, logo: 1 } }],
      },
    },

    // Stage 7: Project clean output
    {
      $project: {
        _id: 1,
        name: 1,
        role: 1,
        avatar: { $ifNull: ["$avatar", "$image"] },
        headline: { $arrayElemAt: ["$_jobSeeker.headline", 0] },
        companyName: { $arrayElemAt: ["$_employer.companyName", 0] },
        companyLogo: { $arrayElemAt: ["$_employer.logo", 0] },
        _searchScore: 1,
      },
    },
  ];

  // Also search by headline/companyName — run a separate lightweight query
  // for users whose name doesn't match but headline/company does
  const secondaryPipeline: mongoose.PipelineStage[] = [
    {
      $match: {
        _id: { $ne: currentUserId },
        isActive: true,
        lockUntil: { $not: { $gt: new Date() } },
        role: { $in: searchableRoles },
        // Name does NOT match (already covered above)
        name: { $not: { $regex: safe, $options: "i" } },
      },
    },

    // Lookup to check headline / companyName
    {
      $lookup: {
        from: "jobseekers",
        localField: "_id",
        foreignField: "userId",
        as: "_jobSeeker",
        pipeline: [
          { $match: { headline: { $regex: safe, $options: "i" } } },
          { $project: { headline: 1 } },
        ],
      },
    },
    {
      $lookup: {
        from: "employers",
        localField: "_id",
        foreignField: "userId",
        as: "_employer",
        pipeline: [
          { $match: { companyName: { $regex: safe, $options: "i" } } },
          { $project: { companyName: 1, logo: 1 } },
        ],
      },
    },

    // Keep only those with a headline or companyName match
    {
      $match: {
        $or: [
          { "_jobSeeker.0": { $exists: true } },
          { "_employer.0": { $exists: true } },
        ],
      },
    },

    {
      $addFields: { _searchScore: { $literal: 3 } },
    },

    { $sort: { name: 1 } },
    { $limit: 10 },

    {
      $project: {
        _id: 1,
        name: 1,
        role: 1,
        avatar: { $ifNull: ["$avatar", "$image"] },
        headline: { $arrayElemAt: ["$_jobSeeker.headline", 0] },
        companyName: { $arrayElemAt: ["$_employer.companyName", 0] },
        companyLogo: { $arrayElemAt: ["$_employer.logo", 0] },
        _searchScore: 1,
      },
    },
  ];

  const [nameResults, secondaryResults] = await Promise.all([
    User.aggregate(pipeline),
    User.aggregate(secondaryPipeline),
  ]);

  // Merge, deduplicate by _id, re-sort by score
  const seen = new Set<string>();
  const merged = [];
  for (const user of [...nameResults, ...secondaryResults]) {
    const id = user._id.toString();
    if (!seen.has(id)) {
      seen.add(id);
      merged.push(user);
    }
  }
  merged.sort((a, b) => b._searchScore - a._searchScore || a.name.localeCompare(b.name));

  // Strip internal score field before sending
  const users = merged.slice(0, 20).map(({ _searchScore, ...rest }) => rest);

  return NextResponse.json({ users });
}

export const GET = withAuth(handler);
