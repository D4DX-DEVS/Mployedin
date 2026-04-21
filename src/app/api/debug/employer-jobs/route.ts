import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { Employer } from "@/models/Employer";
import User from "@/models/User";
import Job from "@/models/Job";
import { CompanyUser } from "@/models/CompanyUser";
import mongoose from "mongoose";

/**
 * DEBUG endpoint — diagnose why employer sees no jobs.
 * DELETE this file after debugging is complete.
 * GET /api/debug/employer-jobs
 */
async function handler(_req: NextRequest, ctx: { userId: string; role: string }) {
  await connectDB();

  const result: Record<string, unknown> = {
    ctxUserId: ctx.userId,
    ctxRole: ctx.role,
    isValidObjectId: mongoose.Types.ObjectId.isValid(ctx.userId),
  };

  // 1. Check User document
  const user = await User.findById(ctx.userId).select("email role name").lean();
  result.userDoc = user
    ? { _id: String(user._id), email: user.email, role: user.role, name: user.name }
    : null;

  // 2. Check Employer by userId (string — how the API queries it)
  const empByString = await Employer.findOne({ userId: ctx.userId }).select("_id companyName").lean();
  result.employerByString = empByString
    ? { _id: String(empByString._id), companyName: empByString.companyName }
    : null;

  // 3. Check Employer by userId (explicit ObjectId cast)
  let empByObjectId = null;
  if (mongoose.Types.ObjectId.isValid(ctx.userId)) {
    empByObjectId = await Employer.findOne({
      userId: new mongoose.Types.ObjectId(ctx.userId),
    })
      .select("_id companyName")
      .lean();
  }
  result.employerByObjectId = empByObjectId
    ? { _id: String(empByObjectId._id), companyName: empByObjectId.companyName }
    : null;

  // 4. Check Employer by user email (fallback lookup)
  if (user?.email) {
    const empByEmail = await Employer.findOne({ contactEmail: user.email })
      .select("_id companyName userId")
      .lean();
    result.employerByEmail = empByEmail
      ? {
          _id: String(empByEmail._id),
          companyName: empByEmail.companyName,
          userId: String(empByEmail.userId),
          userIdMatches: String(empByEmail.userId) === ctx.userId,
        }
      : null;
  }

  // 5. Count jobs for each found employer
  const empId = empByString?._id ?? empByObjectId?._id;
  if (empId) {
    const jobCount = await Job.countDocuments({ employerId: empId, deletedAt: null });
    result.jobCount = jobCount;

    const jobSample = await Job.find({ employerId: empId, deletedAt: null })
      .select("title status createdAt")
      .limit(5)
      .lean();
    result.jobSample = jobSample.map((j) => ({
      _id: String(j._id),
      title: j.title,
      status: j.status,
      createdAt: j.createdAt,
    }));

    // 6. Check CompanyUser restrictions
    const companyUser = await CompanyUser.findOne({
      companyId: empId,
      userId: ctx.userId,
      status: "active",
    })
      .select("companyRole jobAccess")
      .lean();
    result.companyUser = companyUser
      ? {
          companyRole: companyUser.companyRole,
          jobAccessCount: companyUser.jobAccess?.length ?? 0,
        }
      : null;
  }

  return NextResponse.json(result);
}

export const GET = withAuth(handler as Parameters<typeof withAuth>[0]);
