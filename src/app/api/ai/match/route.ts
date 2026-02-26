import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Job from "@/models/Job";
import JobSeeker from "@/models/JobSeeker";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

/**
 * POST /api/ai/match
 * Body: { jobId: string, jobSeekerId?: string }
 *
 * Returns an AI-computed match score (0-100) + reasoning breakdown for the
 * job seeker vs a job posting.
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  await connectDB();
  const { jobId, jobSeekerId: bodyJobSeekerId } = await req.json();

  if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });

  const [job, seeker] = await Promise.all([
    Job.findById(jobId).lean(),
    JobSeeker.findOne({ userId: bodyJobSeekerId ?? ctx.userId }).lean(),
  ]);

  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (!seeker) return NextResponse.json({ error: "Job seeker profile not found" }, { status: 404 });

  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const prompt = `You are a recruitment AI. Analyse the match between a job seeker and a job posting.

JOB:
Title: ${job.title}
Category: ${job.category ?? "N/A"}
Location: ${job.location ?? "N/A"}
Required Skills: ${(job.requirements ?? []).join(", ") || "Not specified"}
Description: ${(job.description ?? "").slice(0, 500)}

JOB SEEKER PROFILE:
Current Title: ${seeker.currentJobTitle ?? "N/A"}
Skills: ${(seeker.skills ?? []).join(", ") || "Not specified"}
Years of Experience: ${seeker.yearsOfExperience ?? "N/A"}
Nationality: ${seeker.nationality ?? "N/A"}
Languages: ${(seeker.languages ?? []).map((l: { language: string; proficiency: string }) => `${l.language} (${l.proficiency})`).join(", ") || "N/A"}

Return a JSON object ONLY (no markdown) with this exact structure:
{
  "score": <integer 0-100>,
  "breakdown": {
    "skills": <integer 0-100>,
    "experience": <integer 0-100>,
    "location": <integer 0-100>,
    "language": <integer 0-100>
  },
  "strengths": [<2-3 short bullet strings>],
  "gaps": [<1-2 short bullet strings>],
  "summary": "<2 sentence match summary>"
}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().replace(/```json\n?|```/g, "").trim();

  let matchData;
  try {
    matchData = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "AI response could not be parsed. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ jobId, ...matchData });
});
