import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import JobSeeker from "@/models/JobSeeker";
import { generateText, GEMINI_MODELS } from "@/lib/ai/gemini";
import { checkRateLimitDual, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { sanitizeAIInput } from "@/lib/ai/sanitize";

export const POST = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rl = await checkRateLimitDual(req, ctx.userId, RATE_LIMIT_CONFIGS.ai);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  await connectDB();
  const seeker = await JobSeeker.findOne({ userId: ctx.userId })
    .select("cv skills experience education headline")
    .lean();

  if (!seeker) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const cvText = seeker.cv?.rawText ?? "";
  const skills = (seeker.skills ?? []).slice(0, 15).join(", ");
  const latestRole = (seeker.experience as Array<{ jobTitle?: string; company?: string }> | undefined)?.[0];
  const latestEducation = (seeker.education as Array<{ degree?: string; field?: string }> | undefined)?.[0];

  if (!cvText && !skills && !latestRole) {
    return NextResponse.json(
      { error: "Not enough profile data to generate a summary. Please upload your CV first." },
      { status: 422 }
    );
  }

  const context = [
    latestRole ? `Current/latest role: ${sanitizeAIInput(latestRole.jobTitle ?? "", 80)} at ${sanitizeAIInput(latestRole.company ?? "", 80)}` : "",
    latestEducation ? `Education: ${sanitizeAIInput(latestEducation.degree ?? "", 60)} in ${sanitizeAIInput(latestEducation.field ?? "", 60)}` : "",
    skills ? `Key skills: ${sanitizeAIInput(skills, 200)}` : "",
    cvText ? `CV extract:\n${sanitizeAIInput(cvText, 800)}` : "",
  ].filter(Boolean).join("\n");

  const prompt = `You are a professional career coach. Write a compelling 2-3 sentence professional summary for a job seeker based on their profile data below.
The summary should:
- Be written in first person
- Highlight their most relevant experience and skills
- Sound natural and professional (not generic)
- Be 50-80 words

Profile data:
${context}

Return ONLY the summary text. No quotes, no labels, no extra formatting.`;

  const summary = (await generateText(prompt, GEMINI_MODELS.flash, 256)).trim();

  if (!summary) {
    return NextResponse.json({ error: "Failed to generate summary" }, { status: 500 });
  }

  // Save the generated summary to the profile and recalculate completeness
  const updated = await JobSeeker.findOneAndUpdate(
    { userId: ctx.userId },
    { $set: { summary } },
    { new: true }
  );

  if (updated) {
    const doc = updated.toObject ? updated.toObject() : updated;
    let completeness = 0;
    if (doc.userId)                                             completeness += 10;
    if (doc.nationality)                                        completeness += 10;
    if (doc.currentLocation)                                    completeness += 5;
    if (doc.summary)                                            completeness += 10;
    if (Array.isArray(doc.skills)     && doc.skills.length)    completeness += 20;
    if (Array.isArray(doc.experience) && doc.experience.length) completeness += 20;
    if (Array.isArray(doc.education)  && doc.education.length) completeness += 15;
    if (Array.isArray(doc.languages)  && doc.languages.length) completeness += 5;
    if (doc.linkedin || doc.socialLinks?.some((l: { label?: string }) => l.label?.toLowerCase() === "linkedin")) completeness += 5;
    completeness = Math.min(100, completeness);
    await JobSeeker.updateOne({ userId: ctx.userId }, { $set: { profileCompleteness: completeness } });
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "ai.generate_summary",
    resource: "ai",
    req,
  });

  return NextResponse.json({ summary });
}, { aiQuota: true });
