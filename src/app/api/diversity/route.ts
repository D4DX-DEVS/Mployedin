import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import DiversityResponse from "@/models/DiversityResponse";
import Employer from "@/models/Employer";
import Application from "@/models/Application";
import Job from "@/models/Job";
import JobSeeker from "@/models/JobSeeker";
import mongoose from "mongoose";

// GET: Employer gets aggregated diversity report (anonymized)
async function getHandler(req: NextRequest, ctx: { userId: string; role: string }) {
  await connectDB();

  const employer = await Employer.findOne({ userId: ctx.userId }).lean();
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  const url = new URL(req.url);
  const jobId = url.searchParams.get("jobId");

  const filter: Record<string, unknown> = { employerId: employer._id };
  if (jobId && mongoose.isValidObjectId(jobId)) {
    // Verify jobId belongs to this employer before using it
    const job = await Job.findById(jobId).select("employerId").lean();
    if (!job || String(job.employerId) !== String(employer._id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    filter.jobId = new mongoose.Types.ObjectId(jobId);
  }

  const responses = await DiversityResponse.find(filter).lean();
  const totalApplications = await Application.countDocuments(
    jobId ? { jobId: new mongoose.Types.ObjectId(jobId) } : { employerId: employer._id }
  );

  // Aggregate anonymized stats
  const genderDistribution: Record<string, number> = {};
  const ethnicityDistribution: Record<string, number> = {};
  const ageDistribution: Record<string, number> = {};
  let veteranYes = 0;
  let disabilityYes = 0;

  for (const r of responses) {
    if (r.gender) genderDistribution[r.gender] = (genderDistribution[r.gender] || 0) + 1;
    if (r.ethnicity) ethnicityDistribution[r.ethnicity] = (ethnicityDistribution[r.ethnicity] || 0) + 1;
    if (r.ageRange) ageDistribution[r.ageRange] = (ageDistribution[r.ageRange] || 0) + 1;
    if (r.veteranStatus === "yes") veteranYes++;
    if (r.disabilityStatus === "yes") disabilityYes++;
  }

  const report = {
    totalApplications,
    totalResponses: responses.length,
    responseRate: totalApplications > 0 ? Math.round((responses.length / totalApplications) * 100) : 0,
    genderDistribution,
    ethnicityDistribution,
    ageDistribution,
    veteranRate: responses.length > 0 ? Math.round((veteranYes / responses.length) * 100) : 0,
    disabilityRate: responses.length > 0 ? Math.round((disabilityYes / responses.length) * 100) : 0,
  };

  return NextResponse.json({ report });
}

// POST: Candidate submits voluntary diversity data
async function postHandler(req: NextRequest, ctx: { userId: string; role: string }) {
  await connectDB();

  const body = await req.json();
  const { applicationId } = body;

  if (!applicationId || !mongoose.isValidObjectId(applicationId)) {
    return NextResponse.json({ error: "Valid applicationId required" }, { status: 400 });
  }

  const application = await Application.findById(applicationId).lean();
  if (!application) return NextResponse.json({ error: "Application not found" }, { status: 404 });

  // Verify the user owns this application. Applications store jobSeekerId
  // (JobSeeker._id), not the User id, so resolve the caller's profile first.
  const seeker = await JobSeeker.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!seeker || String(application.jobSeekerId) !== String(seeker._id)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Check for existing response
  const existing = await DiversityResponse.findOne({ applicationId });
  if (existing) return NextResponse.json({ error: "Already submitted" }, { status: 409 });

  await DiversityResponse.create({
    applicationId: new mongoose.Types.ObjectId(applicationId),
    jobId: application.jobId,
    employerId: application.employerId,
    gender: body.gender || undefined,
    ethnicity: body.ethnicity || undefined,
    veteranStatus: body.veteranStatus || undefined,
    disabilityStatus: body.disabilityStatus || undefined,
    ageRange: body.ageRange || undefined,
  });

  return NextResponse.json({ message: "Diversity response submitted. Thank you!" }, { status: 201 });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
