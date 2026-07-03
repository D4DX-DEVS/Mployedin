import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import ReferralLink from "@/models/ReferralLink";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import mongoose from "mongoose";
import crypto from "crypto";
import { validateBody } from "@/lib/validators";
import { referralLinkCreateSchema } from "@/lib/validators/referral-links";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { escapeRegex } from "@/lib/security/sanitize";

interface AuthCtx {
  userId: string;
  role: string;
  locale: string;
}

function generateCode(): string {
  return `MPL-${crypto.randomBytes(8).toString("hex").toUpperCase()}`;
}

/**
 * GET /api/referral-links
 * List referral links based on role:
 * - agent: own links
 * - super_agent: own links + agents under them
 * - admin: all links
 *
 * Query params: page, limit, search, status, creatorRole, dateFrom, dateTo, sortBy, sortOrder
 */
async function handleGet(req: NextRequest, ctx: AuthCtx) {
  await connectDB();
  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1"));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20")));
  const search = url.searchParams.get("search")?.trim();
  const statusFilter = url.searchParams.get("status")?.trim();
  const creatorRoleFilter = url.searchParams.get("creatorRole")?.trim();
  const dateFrom = url.searchParams.get("dateFrom")?.trim();
  const dateTo = url.searchParams.get("dateTo")?.trim();
  const sortBy = url.searchParams.get("sortBy")?.trim() || "createdAt";
  const sortOrder = url.searchParams.get("sortOrder")?.trim() === "asc" ? 1 : -1;
  const skip = (page - 1) * limit;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ownerFilter: Record<string, any> = {};

  if (ctx.role === "agent") {
    ownerFilter.createdBy = new mongoose.Types.ObjectId(ctx.userId);
  } else if (ctx.role === "super_agent") {
    let sa = await SuperAgent.findOne({ userId: ctx.userId }).select("_id agentIds").lean();
    // Auto-create super-agent profile if missing (data integrity recovery)
    if (!sa) {
      const created = await SuperAgent.create({ userId: ctx.userId });
      sa = { _id: created._id, agentIds: [] } as typeof sa;
    }

    const agentUserIds: string[] = [];
    if (sa.agentIds?.length) {
      const agents = await Agent.find({ _id: { $in: sa.agentIds } }).select("userId").lean();
      agentUserIds.push(...agents.map((a) => a.userId.toString()));
    }
    ownerFilter.createdBy = { $in: [new mongoose.Types.ObjectId(ctx.userId), ...agentUserIds.map((id) => new mongoose.Types.ObjectId(id))] };
  } else if (ctx.role === "admin") {
    // Admin sees all
  } else {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = { ...ownerFilter };

  // Text search
  if (search) {
    const safe = escapeRegex(search);
    filter.$or = [
      { code: { $regex: safe, $options: "i" } },
      { label: { $regex: safe, $options: "i" } },
    ];
  }

  // Status filter (computed from isActive, expiresAt, maxUses/usedCount)
  const VALID_STATUSES = new Set(["active", "expired", "maxed", "inactive"]);
  if (statusFilter && VALID_STATUSES.has(statusFilter)) {
    const now = new Date();
    switch (statusFilter) {
      case "active":
        filter.isActive = true;
        filter.$and = [
          { $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gt: now } }] },
          { $or: [{ maxUses: 0 }, { $expr: { $lt: ["$usedCount", "$maxUses"] } }] },
        ];
        break;
      case "expired":
        filter.isActive = true;
        filter.expiresAt = { $lte: now };
        break;
      case "maxed":
        filter.isActive = true;
        filter.maxUses = { $gt: 0 };
        filter.$expr = { $gte: ["$usedCount", "$maxUses"] };
        break;
      case "inactive":
        filter.isActive = false;
        break;
    }
  }

  // Creator role filter
  const VALID_ROLES = new Set(["agent", "super_agent"]);
  if (creatorRoleFilter && VALID_ROLES.has(creatorRoleFilter)) {
    filter.creatorRole = creatorRoleFilter;
  }

  // Date range filter
  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = end;
    }
  }

  // Validate sort field
  const VALID_SORT_FIELDS = new Set(["createdAt", "usedCount", "code", "label"]);
  const safeSortBy = VALID_SORT_FIELDS.has(sortBy) ? sortBy : "createdAt";

  // Run queries: paginated list + total + aggregate stats (scoped to owner filter only)
  const [links, total, statsAgg] = await Promise.all([
    ReferralLink.find(filter)
      .sort({ [safeSortBy]: sortOrder })
      .skip(skip)
      .limit(limit)
      .populate("createdBy", "name email")
      .lean(),
    ReferralLink.countDocuments(filter),
    ReferralLink.aggregate([
      { $match: ownerFilter },
      {
        $group: {
          _id: null,
          totalLinks: { $sum: 1 },
          totalRegistrations: { $sum: "$usedCount" },
          activeLinks: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$isActive", true] },
                    { $or: [
                      { $eq: [{ $ifNull: ["$expiresAt", null] }, null] },
                      { $gt: ["$expiresAt", new Date()] },
                    ] },
                    { $or: [
                      { $eq: [{ $ifNull: ["$maxUses", 0] }, 0] },
                      { $lt: ["$usedCount", "$maxUses"] },
                    ] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          myLinks: {
            $sum: { $cond: [{ $eq: ["$createdBy", new mongoose.Types.ObjectId(ctx.userId)] }, 1, 0] },
          },
          agentLinks: {
            $sum: { $cond: [{ $eq: ["$creatorRole", "agent"] }, 1, 0] },
          },
        },
      },
    ]),
  ]);

  const stats = statsAgg[0] ?? { totalLinks: 0, activeLinks: 0, totalRegistrations: 0, myLinks: 0, agentLinks: 0 };

  return NextResponse.json({
    links,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    stats: {
      totalLinks: stats.totalLinks,
      activeLinks: stats.activeLinks,
      totalRegistrations: stats.totalRegistrations,
      myLinks: stats.myLinks,
      agentLinks: stats.agentLinks,
    },
  });
}

/**
 * POST /api/referral-links
 * Create a new referral link
 */
async function handlePost(req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  if (ctx.role !== "agent" && ctx.role !== "super_agent") {
    return NextResponse.json(
      { error: "Only agents and super-agents can create referral links" },
      { status: 403 }
    );
  }

  const body = await validateBody(req, referralLinkCreateSchema);
  const label = body.label ?? "";
  const maxUses = body.maxUses;
  const expiresAt = body.expiresAt ? new Date(body.expiresAt) : undefined;

  // Validate expiry is in the future
  if (expiresAt && expiresAt <= new Date()) {
    return NextResponse.json({ error: "Expiry date must be in the future" }, { status: 400 });
  }

  // Generate unique code
  let code = generateCode();
  let attempts = 0;
  while (await ReferralLink.exists({ code })) {
    code = generateCode();
    attempts++;
    if (attempts > 10) {
      return NextResponse.json({ error: "Failed to generate unique code" }, { status: 500 });
    }
  }

  // Resolve agentId / superAgentId
  let agentId: string | undefined;
  let superAgentId: string | undefined;

  if (ctx.role === "agent") {
    let agent = await Agent.findOne({ userId: ctx.userId }).select("_id").lean();
    // Auto-create agent profile if missing (data integrity recovery)
    if (!agent) {
      const created = await Agent.create({ userId: ctx.userId });
      agent = { _id: created._id };
    }
    agentId = agent._id.toString();
  } else {
    let sa = await SuperAgent.findOne({ userId: ctx.userId }).select("_id").lean();
    // Auto-create super-agent profile if missing (data integrity recovery)
    if (!sa) {
      const created = await SuperAgent.create({ userId: ctx.userId });
      sa = { _id: created._id };
    }
    superAgentId = sa._id.toString();
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ??
    process.env.NEXTAUTH_URL ??
    "https://mployedin.com";

  const link = await ReferralLink.create({
    code,
    createdBy: ctx.userId,
    creatorRole: ctx.role,
    ...(agentId ? { agentId } : {}),
    ...(superAgentId ? { superAgentId } : {}),
    label: label || undefined,
    maxUses,
    expiresAt,
  });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "referral_link.create",
    resource: "referral_links",
    resourceId: link._id.toString(),
    meta: { code, label, maxUses, creatorRole: ctx.role },
    req,
  });

  return NextResponse.json({
    link,
    referralUrl: `${baseUrl}/en/employer-register?ref=${code}`,
  }, { status: 201 });
}

export const GET = withAuth(handleGet);
export const POST = withAuth(handlePost);
