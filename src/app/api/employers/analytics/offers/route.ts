import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { Employer } from "@/models/Employer";
import { Offer, type OfferStatus } from "@/models/Offer";
import type { UserRole } from "@/models/User";

interface AuthCtx {
  userId: string;
  role: UserRole;
  locale: string;
}

const OFFER_STATUSES: OfferStatus[] = [
  "pending",
  "accepted",
  "declined",
  "expired",
  "withdrawn",
  "countered",
];

// GET /api/employers/analytics/offers
// Returns offer-acceptance analytics (status breakdown, acceptance rate,
// response rate, avg time-to-accept) scoped to the authenticated employer.
async function getHandler(
  req: NextRequest,
  ctx: AuthCtx
): Promise<NextResponse> {
  if (ctx.role !== "employer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const employer = await Employer.findOne({ userId: ctx.userId })
    .select("_id")
    .lean();
  if (!employer)
    return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  const employerId = employer._id;

  // Status breakdown
  const statusAgg = await Offer.aggregate<{ _id: OfferStatus; count: number }>([
    { $match: { employerId } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);

  const counts: Record<OfferStatus, number> = {
    pending: 0,
    accepted: 0,
    declined: 0,
    expired: 0,
    withdrawn: 0,
    countered: 0,
  };
  for (const row of statusAgg) {
    if (row._id in counts) counts[row._id] = row.count;
  }

  const totalOffers = OFFER_STATUSES.reduce((sum, s) => sum + counts[s], 0);
  // Responded = candidate took an explicit action (accepted / declined / countered)
  const responded = counts.accepted + counts.declined + counts.countered;
  const acceptanceRate =
    totalOffers > 0 ? Math.round((counts.accepted / totalOffers) * 100) : 0;
  const responseRate =
    totalOffers > 0 ? Math.round((responded / totalOffers) * 100) : 0;

  // Avg time-to-accept (days between createdAt and respondedAt for accepted offers)
  const acceptedTiming = await Offer.aggregate<{ avgDays: number }>([
    {
      $match: {
        employerId,
        status: "accepted",
        respondedAt: { $exists: true, $ne: null },
      },
    },
    {
      $project: {
        days: {
          $divide: [{ $subtract: ["$respondedAt", "$createdAt"] }, 86400000],
        },
      },
    },
    { $group: { _id: null, avgDays: { $avg: "$days" } } },
  ]);
  const avgTimeToAcceptDays =
    acceptedTiming[0]?.avgDays != null
      ? Math.round(acceptedTiming[0].avgDays * 10) / 10
      : null;

  const statusBreakdown = OFFER_STATUSES.map((status) => ({
    status,
    count: counts[status],
  })).filter((row) => row.count > 0);

  return NextResponse.json(
    {
      totalOffers,
      accepted: counts.accepted,
      declined: counts.declined,
      pending: counts.pending,
      expired: counts.expired,
      withdrawn: counts.withdrawn,
      countered: counts.countered,
      acceptanceRate,
      responseRate,
      avgTimeToAcceptDays,
      statusBreakdown,
    },
    {
      headers: {
        "Cache-Control":
          "private, max-age=60, stale-while-revalidate=120",
      },
    }
  );
}

export const GET = withAuth(getHandler);
