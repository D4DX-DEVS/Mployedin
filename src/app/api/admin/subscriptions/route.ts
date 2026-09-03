/**
 * GET /api/admin/subscriptions — Paginated list of all subscriptions
 *
 * Query params:
 *   page (default 1), limit (default 20, max 100),
 *   status (active|expired|cancelled|suspended),
 *   role (employer|job_seeker),
 *   planId, search (name/email), sortBy, sortOrder,
 *   autoRenew (true|false), dateFrom, dateTo
 *
 * Admin / super_agent / agent only.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import connectDB from "@/lib/db/mongoose";
import Subscription from "@/models/Subscription";
import { Employer } from "@/models/Employer";
import { getScopedEmployerIds } from "@/lib/auth/agentRestrictions";
import type { UserRole } from "@/types/user";

interface AuthCtx { userId: string; role: UserRole; locale: string }

async function handler(req: NextRequest, ctx: AuthCtx) {
  if (!["admin", "super_agent", "agent"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const url = req.nextUrl;
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 20));
  const status = url.searchParams.get("status") || undefined;
  const role = url.searchParams.get("role") || undefined;
  const planId = url.searchParams.get("planId") || undefined;
  const search = url.searchParams.get("search")?.trim() || undefined;
  const sortBy = url.searchParams.get("sortBy") || "createdAt";
  const sortOrder = url.searchParams.get("sortOrder") === "asc" ? 1 : -1;
  const autoRenew = url.searchParams.get("autoRenew") || undefined;
  const dateFrom = url.searchParams.get("dateFrom") || undefined;
  const dateTo = url.searchParams.get("dateTo") || undefined;

  // Build filter
  const filter: Record<string, unknown> = {};

  // Scope non-admins to the employers they manage. getScopedEmployerIds returns
  // an explicit id list for agent / super_agent ([] = see nothing), so the list
  // can never fall through to the platform-wide read it previously performed
  // (every customer's name, email, plan and status was visible to any agent).
  if (ctx.role !== "admin") {
    const employerIds = (await getScopedEmployerIds(ctx)) ?? [];
    const employerUserIds = employerIds.length
      ? (await Employer.find({ _id: { $in: employerIds } }).select("userId").lean()).map((e) => e.userId)
      : [];
    filter.userId = { $in: employerUserIds };
  }

  if (status && ["active", "expired", "cancelled", "suspended"].includes(status)) {
    filter.status = status;
  }
  if (role && ["employer", "job_seeker"].includes(role)) {
    filter.targetRole = role;
  }
  if (planId) {
    filter.planId = planId;
  }
  if (autoRenew === "true" || autoRenew === "false") {
    filter.autoRenew = autoRenew === "true";
  }
  if (dateFrom || dateTo) {
    const dateFilter: Record<string, Date> = {};
    if (dateFrom) dateFilter.$gte = new Date(dateFrom);
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      dateFilter.$lte = end;
    }
    filter.createdAt = dateFilter;
  }

  // Build sort — allow only safe fields
  const allowedSorts = ["createdAt", "endDate", "startDate", "status"];
  const sortField = allowedSorts.includes(sortBy) ? sortBy : "createdAt";

  // Run count + query in parallel
  let query = Subscription.find(filter)
    .populate("userId", "name email role profileImage")
    .sort({ [sortField]: sortOrder })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  // If search provided, we need to filter by populated user fields.
  // Since Mongoose can't filter on populated fields in .find(), we use aggregate.
  if (search) {
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pipeline: any[] = [
      // Match subscription filters
      { $match: filter },
      // Lookup user
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "userInfo",
          pipeline: [
            { $project: { name: 1, email: 1, role: 1, profileImage: 1 } },
          ],
        },
      },
      { $unwind: { path: "$userInfo", preserveNullAndEmptyArrays: true } },
      // Filter by user name/email
      {
        $match: {
          $or: [
            { "userInfo.name": { $regex: escapedSearch, $options: "i" } },
            { "userInfo.email": { $regex: escapedSearch, $options: "i" } },
          ],
        },
      },
      { $sort: { [sortField]: sortOrder } },
    ];

    const [countResult, subscriptions] = await Promise.all([
      Subscription.aggregate([...pipeline, { $count: "total" }]),
      Subscription.aggregate([
        ...pipeline,
        { $skip: (page - 1) * limit },
        { $limit: limit },
        {
          $addFields: {
            userId: "$userInfo",
          },
        },
        { $project: { userInfo: 0 } },
      ]),
    ]);

    const total = countResult[0]?.total ?? 0;
    return NextResponse.json({
      subscriptions,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  }

  // No search — simple query
  const [total, subscriptions] = await Promise.all([
    Subscription.countDocuments(filter),
    query,
  ]);

  return NextResponse.json({
    subscriptions,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
}

export const GET = withAuth(handler, {
  resource: "subscriptions",
  action: "read",
});
