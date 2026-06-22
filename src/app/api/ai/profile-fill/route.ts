import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import JobSeeker from "@/models/JobSeeker";
import { generateText, GEMINI_MODELS } from "@/lib/ai/gemini";
import { checkRateLimitDual, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { sanitizeAIInput } from "@/lib/ai/sanitize";
import { validateBody } from "@/lib/validators";
import { aiProfileFillSchema } from "@/lib/validators/ai";
import { logActivity, actorFromCtx } from "@/lib/audit/log";

type SectionId = "summary" | "skills" | "experience" | "education" | "languages";

const SECTION_PROMPTS: Record<SectionId, string> = {
  summary: `Write a compelling 2-3 sentence professional summary in first person.
Return ONLY the summary text. No quotes, no labels.`,

  skills: `Extract a list of professional skills from the user's input.
Return ONLY a JSON array of strings, e.g. ["React", "Node.js", "MongoDB"]. Max 15 skills.`,

  experience: `Extract work experience entries from the user's input.
Return ONLY a JSON array of objects with these fields:
[{ "jobTitle": "...", "company": "...", "startDate": "YYYY-MM", "endDate": "YYYY-MM or null", "isCurrent": true/false, "description": "1-2 sentence description" }]`,

  education: `Extract education entries from the user's input.
Return ONLY a JSON array of objects with these fields:
[{ "degree": "...", "field": "...", "institution": "...", "country": "...", "startDate": "YYYY-MM", "endDate": "YYYY-MM or null" }]`,

  languages: `Extract languages and proficiency levels from the user's input.
Return ONLY a JSON array of objects with these fields:
[{ "language": "...", "level": "native|fluent|advanced|intermediate|beginner" }]`,
};

const VALID_SECTIONS = new Set<SectionId>(["summary", "skills", "experience", "education", "languages"]);

/**
 * POST /api/ai/profile-fill
 *
 * Takes a section id and user-provided rough text, uses AI to structure it,
 * then saves to the profile.
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rl = await checkRateLimitDual(req, ctx.userId, RATE_LIMIT_CONFIGS.ai);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  const body = await validateBody(req, aiProfileFillSchema);
  const section = body.section;
  const userInput = body.input;

  await connectDB();
  const seeker = await JobSeeker.findOne({ userId: ctx.userId }).lean();
  if (!seeker) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const sanitized = sanitizeAIInput(userInput, 1500);
  const sectionId = section as SectionId;
  const sectionPrompt = SECTION_PROMPTS[sectionId];

  const existingContext = [
    seeker.skills?.length ? `Existing skills: ${(seeker.skills as string[]).slice(0, 10).join(", ")}` : "",
    (seeker.experience as unknown[])?.length ? `Has ${(seeker.experience as unknown[]).length} existing experience entries` : "",
  ].filter(Boolean).join("\n");

  const prompt = `You are a professional career assistant for MPLOYEDIN, a recruitment platform.

The user wants to fill their "${sectionId}" profile section. They provided this rough input:
"${sanitized}"

${existingContext ? `Context about their current profile:\n${existingContext}\n` : ""}
${sectionPrompt}`;

  const rawResult = (await generateText(prompt, GEMINI_MODELS.flash, 1024)).trim();

  if (!rawResult) {
    return NextResponse.json({ error: "AI could not generate content. Try providing more details." }, { status: 500 });
  }

  // Parse AI output based on section type
  let parsedData: unknown;
  let updateFields: Record<string, unknown> = {};

  try {
    if (sectionId === "summary") {
      // Summary is plain text — strip any accidental quotes/labels
      parsedData = rawResult.replace(/^["']|["']$/g, "").trim();
      updateFields = { summary: parsedData };
    } else {
      // All other sections return JSON
      const cleaned = rawResult.replace(/```json\n?|```\n?/g, "").trim();
      parsedData = JSON.parse(cleaned);

      if (sectionId === "skills" && Array.isArray(parsedData)) {
        const cleanSkills = (parsedData as string[])
          .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
          .map((s) => s.trim())
          .slice(0, 15);
        // Merge with existing skills, deduplicate
        const existing = new Set((seeker.skills as string[] ?? []).map((s: string) => s.toLowerCase()));
        const merged = [...(seeker.skills as string[] ?? [])];
        for (const skill of cleanSkills) {
          if (!existing.has(skill.toLowerCase())) {
            merged.push(skill);
            existing.add(skill.toLowerCase());
          }
        }
        parsedData = merged;
        updateFields = { skills: merged };
      } else if (sectionId === "experience" && Array.isArray(parsedData)) {
        const existing = (seeker.experience as unknown[]) ?? [];
        parsedData = [...existing, ...parsedData];
        updateFields = { experience: parsedData };
      } else if (sectionId === "education" && Array.isArray(parsedData)) {
        const existing = (seeker.education as unknown[]) ?? [];
        parsedData = [...existing, ...parsedData];
        updateFields = { education: parsedData };
      } else if (sectionId === "languages" && Array.isArray(parsedData)) {
        const existing = (seeker.languages as unknown[]) ?? [];
        parsedData = [...existing, ...parsedData];
        updateFields = { languages: parsedData };
      }
    }
  } catch {
    return NextResponse.json({
      error: "AI generated an unexpected format. Try rewording your input.",
      raw: rawResult.slice(0, 300),
    }, { status: 422 });
  }

  // Save to profile
  const updated = await JobSeeker.findOneAndUpdate(
    { userId: ctx.userId },
    { $set: updateFields },
    { new: true },
  );

  // Recalculate completeness
  let completeness = 0;
  if (updated) {
    const doc = updated.toObject ? updated.toObject() : updated;
    if (doc.userId) completeness += 10;
    if (doc.nationality) completeness += 10;
    if (doc.currentLocation) completeness += 5;
    if (doc.summary) completeness += 10;
    if (Array.isArray(doc.skills) && doc.skills.length) completeness += 20;
    if (Array.isArray(doc.experience) && doc.experience.length) completeness += 20;
    if (Array.isArray(doc.education) && doc.education.length) completeness += 15;
    if (Array.isArray(doc.languages) && doc.languages.length) completeness += 5;
    const socialLinks = doc.socialLinks as Array<{ label?: string }> | undefined;
    if (doc.linkedin || socialLinks?.some((l: { label?: string }) => l.label?.toLowerCase() === "linkedin")) completeness += 5;
    completeness = Math.min(100, completeness);
    await JobSeeker.updateOne({ userId: ctx.userId }, { $set: { profileCompleteness: completeness } });
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "ai.profile_fill",
    resource: "ai",
    meta: { section: sectionId },
    req,
  });

  return NextResponse.json({
    section: sectionId,
    data: parsedData,
    profileCompleteness: completeness,
    message: `Your ${sectionId} has been updated successfully.`,
  });
}, { aiQuota: true });
