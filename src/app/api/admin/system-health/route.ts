import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import User from "@/models/User";
import Job from "@/models/Job";
import Application from "@/models/Application";
import SubscriptionPlan from "@/models/SubscriptionPlan";
import Webhook from "@/models/Webhook";
import Conversation from "@/models/Conversation";
import ContactSubmission from "@/models/ContactSubmission";
import { isSubscriptionEnforcementEnabled } from "@/lib/subscription/enforcementFlag";
import mongoose from "mongoose";

/* ------------------------------------------------------------------ */
/*  GET /api/admin/system-health — Platform health metrics             */
/* ------------------------------------------------------------------ */

async function handler(req: NextRequest, ctx: AuthContext) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  /* Measure DB latency */
  const dbStart = Date.now();
  await mongoose.connection.db?.admin().ping();
  const dbLatency = Date.now() - dbStart;

  /* Parallel data fetching */
  const [
    totalUsers,
    activeUsers,
    totalJobs,
    activeJobs,
    applicationsToday,
    employerPlans,
    employerDefault,
    jobSeekerPlans,
    jobSeekerDefault,
    enforcementEnabled,
    activeLast24h,
    webhooksActive,
    webhooksFailing,
    openSupportTickets,
    unreadContactSubmissions,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ isActive: true }),
    Job.countDocuments(),
    Job.countDocuments({ status: "active" }),
    Application.countDocuments({ createdAt: { $gte: todayStart } }),
    SubscriptionPlan.countDocuments({ targetRole: "employer", isActive: true }),
    SubscriptionPlan.countDocuments({ targetRole: "employer", isActive: true, isDefault: true }),
    SubscriptionPlan.countDocuments({ targetRole: "job_seeker", isActive: true }),
    SubscriptionPlan.countDocuments({ targetRole: "job_seeker", isActive: true, isDefault: true }),
    isSubscriptionEnforcementEnabled(),
    User.countDocuments({ lastLogin: { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } }),
    Webhook.countDocuments({ isActive: true }),
    Webhook.countDocuments({ isActive: true, lastStatus: "failed" }),
    Conversation.countDocuments({
      type: "customer_care",
      "customerCare.status": { $in: ["open", "assigned"] },
    }),
    ContactSubmission.countDocuments({ isRead: false }),
  ]);

  // A role with no active default plan means registration auto-assign silently
  // skips and every new user lands in the 30-day grace period — a fresh
  // environment with no seeded catalogue. Worth a warning even while enforcement
  // is off; critical once it is on.
  const catalogueMissing = employerDefault === 0 || jobSeekerDefault === 0;
  const subscriptionPlansStatus = !catalogueMissing ? "healthy" : enforcementEnabled ? "critical" : "warning";

  /* Memory usage — real process figures */
  const memUsage = process.memoryUsage();

  /* Connection pool info */
  const connections = mongoose.connections.length;

  /* Real storage figures straight from the database, not constants. `dbStats`
     is unavailable on some hosted tiers, so a failure degrades to null rather
     than inventing a number. */
  let storage: { dataMb: number; storageMb: number; indexMb: number } | null = null;
  try {
    const stats = (await mongoose.connection.db?.stats()) as
      | { dataSize?: number; storageSize?: number; indexSize?: number }
      | undefined;
    if (stats) {
      storage = {
        dataMb: Math.round((stats.dataSize ?? 0) / 1024 / 1024),
        storageMb: Math.round((stats.storageSize ?? 0) / 1024 / 1024),
        indexMb: Math.round((stats.indexSize ?? 0) / 1024 / 1024),
      };
    }
  } catch {
    storage = null;
  }

  const integrationsStatus =
    webhooksFailing === 0 ? "healthy" : webhooksFailing >= 3 ? "critical" : "warning";
  const supportStatus =
    openSupportTickets === 0 && unreadContactSubmissions === 0
      ? "healthy"
      : openSupportTickets >= 10 || unreadContactSubmissions >= 10
        ? "critical"
        : "warning";

  /* Every field below is measured. Nothing is estimated, sampled or filled in
     with a constant: a health page that invents reassurance is worse than no
     health page. Request counts, error rates and platform uptime need a metrics
     store this deployment does not have, so they are absent rather than faked. */
  return NextResponse.json({
    database: {
      status: dbLatency < 200 ? "healthy" : dbLatency < 500 ? "warning" : "critical",
      latencyMs: dbLatency,
      connections,
    },
    storage,
    integrations: {
      status: integrationsStatus,
      active: webhooksActive,
      failing: webhooksFailing,
    },
    support: {
      status: supportStatus,
      openTickets: openSupportTickets,
      unreadSubmissions: unreadContactSubmissions,
    },
    users: {
      activeLast24h,
      totalActive: activeUsers,
      totalRegistered: totalUsers,
    },
    jobs: {
      active: activeJobs,
      total: totalJobs,
      applicationsToday,
    },
    subscriptionPlans: {
      status: subscriptionPlansStatus,
      enforcementEnabled,
      employer: { activePlans: employerPlans, hasDefault: employerDefault > 0 },
      jobSeeker: { activePlans: jobSeekerPlans, hasDefault: jobSeekerDefault > 0 },
    },
    process: {
      uptimeSeconds: Math.round(process.uptime()),
      memoryUsedMb: Math.round(memUsage.heapUsed / 1024 / 1024),
      memoryTotalMb: Math.round(memUsage.heapTotal / 1024 / 1024),
    },
  });
}

export const GET = withAuth(handler, { resource: "audit_logs", action: "read" });
