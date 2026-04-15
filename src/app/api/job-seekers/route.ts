import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import JobSeeker from "@/models/JobSeeker";
import User from "@/models/User";

export const GET = withAuth(async (req: NextRequest) => {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "10"), 50);
  const search = searchParams.get("search")?.trim();

  if (search) {
    // Use aggregation pipeline so we can search across the joined User name
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const pipeline = [
      // Join with users collection to get name/email
      { $lookup: { from: User.collection.name, localField: "userId", foreignField: "_id", as: "userId" } },
      { $unwind: { path: "$userId", preserveNullAndEmptyArrays: true } },
      // Filter by user name OR skills
      {
        $match: {
          $or: [
            { "userId.name": { $regex: escapedSearch, $options: "i" } },
            { "userId.email": { $regex: escapedSearch, $options: "i" } },
            { fullName: { $regex: escapedSearch, $options: "i" } },
            { skills: { $regex: escapedSearch, $options: "i" } },
            { currentLocation: { $regex: escapedSearch, $options: "i" } },
            { "experience.jobTitle": { $regex: escapedSearch, $options: "i" } },
          ],
        },
      },
      // Project only the fields the frontend needs
      {
        $project: {
          "userId._id": 1, "userId.name": 1, "userId.email": 1,
          fullName: 1,
          skills: 1, currentLocation: 1, experience: 1,
          profileCompleteness: 1, availabilityStatus: 1, badges: 1,
          totalExperienceYears: 1,
          "cv.originalUrl": 1,
          createdAt: 1,
        },
      },
      { $sort: { createdAt: -1 as const } },
      {
        $facet: {
          items: [{ $skip: (page - 1) * limit }, { $limit: limit }],
          count: [{ $count: "total" }],
        },
      },
    ];

    const [result] = await JobSeeker.aggregate(pipeline);
    const items = result?.items ?? [];
    const total = result?.count?.[0]?.total ?? 0;
    return NextResponse.json({ items, total, page, totalPages: Math.ceil(total / limit) });
  }

  // No search — simple find + populate
  const [items, total] = await Promise.all([
    JobSeeker.find()
      .populate("userId", "name email")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    JobSeeker.countDocuments(),
  ]);

  return NextResponse.json({ items, total, page, totalPages: Math.ceil(total / limit) });
}, { resource: "job_seekers", action: "read" });
