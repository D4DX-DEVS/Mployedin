import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import CompanyReview from "@/models/CompanyReview";
import Employer from "@/models/Employer";
import User from "@/models/User";
import { z } from "zod";
import { validateBody } from "@/lib/validators";

const createReviewSchema = z.object({
  employerId: z.string().min(1),
  rating: z.number().min(1).max(5),
  title: z.string().min(3).max(200),
  pros: z.string().min(10).max(2000),
  cons: z.string().min(10).max(2000),
  overallExperience: z.enum(["positive", "neutral", "negative"]).optional(),
  employmentStatus: z.enum(["current", "former"]).optional(),
  jobTitle: z.string().max(100).optional(),
  recommendToFriend: z.boolean().optional(),
  isAnonymous: z.boolean().optional(),
});

/**
 * GET /api/reviews — Get reviews for a company (public)
 */
export async function GET(req: NextRequest) {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const employerId = searchParams.get("employerId");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(20, parseInt(searchParams.get("limit") ?? "10"));

  if (!employerId) {
    return NextResponse.json({ error: "employerId required" }, { status: 400 });
  }

  const filter = { employerId, status: "approved" };

  const [reviews, total, stats] = await Promise.all([
    CompanyReview.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("userId", "name")
      .lean(),
    CompanyReview.countDocuments(filter),
    CompanyReview.aggregate([
      { $match: { employerId: employerId, status: "approved" } },
      {
        $group: {
          _id: null,
          avgRating: { $avg: "$rating" },
          totalReviews: { $sum: 1 },
          recommended: { $sum: { $cond: ["$recommendToFriend", 1, 0] } },
          rating5: { $sum: { $cond: [{ $eq: ["$rating", 5] }, 1, 0] } },
          rating4: { $sum: { $cond: [{ $eq: ["$rating", 4] }, 1, 0] } },
          rating3: { $sum: { $cond: [{ $eq: ["$rating", 3] }, 1, 0] } },
          rating2: { $sum: { $cond: [{ $eq: ["$rating", 2] }, 1, 0] } },
          rating1: { $sum: { $cond: [{ $eq: ["$rating", 1] }, 1, 0] } },
        },
      },
    ]),
  ]);

  const reviewStats = stats[0] ?? {
    avgRating: 0,
    totalReviews: 0,
    recommended: 0,
    rating5: 0,
    rating4: 0,
    rating3: 0,
    rating2: 0,
    rating1: 0,
  };

  // Anonymize user names if isAnonymous
  const sanitizedReviews = reviews.map((r: Record<string, unknown>) => ({
    ...r,
    userId: (r as Record<string, unknown>).isAnonymous
      ? { name: "Anonymous" }
      : (r as Record<string, unknown>).userId,
  }));

  return NextResponse.json({
    reviews: sanitizedReviews,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    stats: reviewStats,
  });
}

/**
 * POST /api/reviews — Submit a company review (job_seeker only)
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Only job seekers can write reviews" }, { status: 403 });
  }

  await connectDB();
  const body = await validateBody(req, createReviewSchema);

  // Verify the employer exists
  const employer = await Employer.findById(body.employerId).lean();
  if (!employer) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  // Check if user already reviewed this company
  const existing = await CompanyReview.findOne({
    employerId: body.employerId,
    userId: ctx.userId,
  }).lean();

  if (existing) {
    return NextResponse.json({ error: "You have already reviewed this company" }, { status: 409 });
  }

  const review = await CompanyReview.create({
    ...body,
    userId: ctx.userId,
    status: "pending", // requires admin approval
  });

  return NextResponse.json({ review, message: "Review submitted for moderation" }, { status: 201 });
});
