import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import AuditLog from "@/models/AuditLog";
import { CompanyUser } from "@/models/CompanyUser";
import { Employer } from "@/models/Employer";
import { User } from "@/models/User";
import { canManageTeam } from "@/lib/permissions/team";
import { escapeRegex } from "@/lib/security/sanitize";
import { ensureEmployerOwnerMembership } from "@/lib/employers/company-membership";
import type { UserRole } from "@/models/User";
import type { CompanyRole } from "@/models/CompanyUser";

interface AuthCtx {
  userId: string;
  role: UserRole;
  locale: string;
}

/**
 * GET /api/employers/team/activity-logs
 *
 * Returns audit log entries for all team members of the employer's company.
 * The employer (owner/admin) can see what every team member has done:
 * logins, job management, interview scheduling, applications, etc.
 *
 * Query params: page, limit, memberId, action, resource, from, to
 */
async function handler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "employer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  // Get employer's company
  const employer = await Employer.findOne({ userId: ctx.userId })
    .select("_id companyEmail")
    .lean();
  if (!employer) {
    return NextResponse.json(
      { error: "Employer profile not found" },
      { status: 404 }
    );
  }

  // Verify caller is owner or admin
  let callerMember: { companyRole: CompanyRole } | null = await CompanyUser.findOne({
    companyId: employer._id,
    userId: ctx.userId,
    status: "active",
  }).select("companyRole").lean();

  if (!callerMember) {
    callerMember = await ensureEmployerOwnerMembership({
      companyId: employer._id,
      userId: ctx.userId,
      email: employer.companyEmail,
    });

    if (!callerMember) {
      return NextResponse.json(
        { error: "Account verification failed. Please contact support." },
        { status: 403 }
      );
    }
  }

  if (!callerMember || !canManageTeam(callerMember.companyRole)) {
    return NextResponse.json(
      { error: "Only owners and admins can view team activity logs" },
      { status: 403 }
    );
  }

  // Get all team member userIds (including owner)
  const teamMembers = await CompanyUser.find({
    companyId: employer._id,
    userId: { $exists: true, $ne: null },
  })
    .select("userId email companyRole")
    .lean();

  const teamUserIds = teamMembers
    .map((m) => m.userId)
    .filter(Boolean);

  if (teamUserIds.length === 0) {
    return NextResponse.json({
      logs: [],
      members: [],
      pagination: { page: 1, limit: 50, total: 0, pages: 0 },
    });
  }

  // Parse query params
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "50"));
  const memberId = searchParams.get("memberId") ?? "";
  const action = searchParams.get("action") ?? "";
  const resource = searchParams.get("resource") ?? "";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";

  // Build query — only logs from team members
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: Record<string, any> = {
    actorId: memberId
      ? memberId
      : { $in: teamUserIds },
  };

  if (action) query.action = new RegExp(escapeRegex(action), "i");
  if (resource) query.resource = resource;

  if (from || to) {
    query.createdAt = {};
    if (from) query.createdAt.$gte = new Date(from);
    if (to) query.createdAt.$lte = new Date(to + "T23:59:59.999Z");
  }

  const [logs, total] = await Promise.all([
    AuditLog.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("actorId", "name email role")
      .lean(),
    AuditLog.countDocuments(query),
  ]);

  // Enrich team member list for filter dropdown
  const userIds = teamMembers
    .map((m) => m.userId)
    .filter(Boolean);
  const users = await User.find({ _id: { $in: userIds } })
    .select("name email")
    .lean();
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  const members = teamMembers.map((m) => ({
    _id: String(m.userId),
    name: m.userId ? (userMap.get(String(m.userId)) as { name?: string })?.name ?? m.email : m.email,
    email: m.email,
    companyRole: m.companyRole,
  }));

  return NextResponse.json({
    logs,
    members,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
}

export const GET = withAuth(handler, { resource: "employers", action: "read" });
