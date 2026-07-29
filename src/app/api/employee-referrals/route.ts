import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import EmployeeReferral, { ReferralProgram } from "@/models/EmployeeReferral";
import Employer from "@/models/Employer";
import { logActivity } from "@/lib/audit/log";
import mongoose from "mongoose";

async function getHandler(req: NextRequest, ctx: { userId: string; role: string }) {
  await connectDB();

  const employer = await Employer.findOne({ userId: ctx.userId }).lean();
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  const url = new URL(req.url);
  const type = url.searchParams.get("type");

  if (type === "program") {
    const program = await ReferralProgram.findOne({ employerId: employer._id, isActive: true }).lean();
    return NextResponse.json({ program });
  }

  const status = url.searchParams.get("status");
  const filter: Record<string, unknown> = { employerId: employer._id };
  if (status) filter.status = status;

  const referrals = await EmployeeReferral.find(filter).sort({ createdAt: -1 }).limit(100).lean();
  const program = await ReferralProgram.findOne({ employerId: employer._id, isActive: true }).lean();

  return NextResponse.json({ referrals, program });
}

async function postHandler(req: NextRequest, ctx: { userId: string; role: string }) {
  await connectDB();

  const employer = await Employer.findOne({ userId: ctx.userId }).lean();
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  const body = await req.json();

  // Create/Update referral program
  if (body.type === "program") {
    const program = await ReferralProgram.findOneAndUpdate(
      { employerId: employer._id },
      {
        employerId: employer._id,
        name: body.name?.trim() || "Employee Referral Program",
        description: body.description?.trim() || "",
        rewardAmount: Math.max(0, Number(body.rewardAmount) || 0),
        rewardCurrency: body.rewardCurrency || "USD",
        rewardCondition: body.rewardCondition || "on_hire",
        probationDays: body.probationDays || 90,
        isActive: body.isActive !== false,
        eligibleRoles: body.eligibleRoles || [],
        maxReferralsPerEmployee: body.maxReferralsPerEmployee || 0,
        createdBy: new mongoose.Types.ObjectId(ctx.userId),
      },
      { upsert: true, returnDocument: "after" }
    );
    return NextResponse.json({ program }, { status: 201 });
  }

  // Submit a referral
  const { candidateName, candidateEmail, jobId, relationship } = body;
  if (!candidateName || !candidateEmail || !relationship) {
    return NextResponse.json({ error: "candidateName, candidateEmail, relationship required" }, { status: 400 });
  }

  const referral = await EmployeeReferral.create({
    employerId: employer._id,
    referrerId: new mongoose.Types.ObjectId(ctx.userId),
    referrerName: body.referrerName || "",
    referrerEmail: body.referrerEmail || "",
    candidateName: candidateName.trim(),
    candidateEmail: candidateEmail.trim(),
    candidatePhone: body.candidatePhone?.trim() || "",
    candidateResumeUrl: body.candidateResumeUrl || "",
    jobId: jobId ? new mongoose.Types.ObjectId(jobId) : undefined,
    jobTitle: body.jobTitle || "",
    relationship: relationship.trim(),
    notes: body.notes?.trim() || "",
    status: "pending",
  });

  await logActivity({ action: "employee_referral.submitted", actorId: ctx.userId, resource: "EmployeeReferral", resourceId: referral._id.toString(), meta: { candidateEmail } });

  return NextResponse.json({ referral }, { status: 201 });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
