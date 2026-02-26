import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { connectDB } from "@/lib/db/mongoose";
import JobSeeker from "@/models/JobSeeker";
import type { UserRole } from "@/models/User";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { logActivity } from "@/lib/audit/log";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session.user as unknown as { role: UserRole }).role;
  if (role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Rate limit upload/AI calls
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown";
  const { allowed } = checkRateLimit(
    `cv-extract:${session.user.id ?? ip}`,
    RATE_LIMIT_CONFIGS.upload
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  try {
    const formData = await req.formData();
    const file = formData.get("cv") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 10 MB." },
        { status: 400 }
      );
    }

    const allowedTypes = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
    ];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Only PDF and image files are accepted" },
        { status: 400 }
      );
    }

    // Convert file to base64 for Gemini Vision
    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    const mimeType = file.type as "application/pdf" | "image/jpeg" | "image/png" | "image/webp";

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `You are an expert CV/Resume parser. Analyze this CV/resume document and extract all relevant information.
Return a JSON object with EXACTLY this structure (no extra fields, no markdown):
{
  "fullName": "string",
  "email": "string",
  "phone": "string",
  "nationality": "string",
  "currentLocation": "string",
  "headline": "string (professional headline/summary in 1-2 sentences)",
  "skills": [{"name": "string", "level": "beginner|intermediate|advanced|expert", "yearsOfExperience": number}],
  "experience": [{"jobTitle": "string", "company": "string", "location": "string", "from": "YYYY-MM", "to": "YYYY-MM or present", "current": boolean, "description": "string"}],
  "education": [{"degree": "string", "field": "string", "institution": "string", "country": "string", "from": "YYYY", "to": "YYYY", "grade": "string"}],
  "languages": [{"language": "string", "level": "basic|intermediate|fluent|native"}],
  "certifications": ["string"],
  "linkedin": "string",
  "portfolio": "string"
}

Rules:
- Extract only what is clearly stated in the CV
- Use empty string for missing text fields
- Use empty array for missing array fields
- For dates, use "present" if the position is current
- Normalize skill names (e.g., "JS" → "JavaScript")
- Return ONLY valid JSON, no markdown code blocks`;

    const result = await model.generateContent([
      prompt,
      { inlineData: { data: base64, mimeType } },
    ]);

    const text = result.response.text().trim();

    // Parse JSON — strip markdown code fences if present
    const jsonStr = text.startsWith("```")
      ? text.replace(/```json?\n?/g, "").replace(/```$/g, "").trim()
      : text;

    const extracted = JSON.parse(jsonStr);

    // Save extracted data to JobSeeker profile
    await connectDB();
    const userId = session.user.id;

    const updateData = {
      ...(extracted.headline && { summary: extracted.headline }),
      ...(extracted.nationality && { nationality: extracted.nationality }),
      ...(extracted.currentLocation && { currentLocation: extracted.currentLocation }),
      ...(extracted.skills?.length && { skills: extracted.skills }),
      ...(extracted.experience?.length && { experience: extracted.experience }),
      ...(extracted.education?.length && { education: extracted.education }),
      ...(extracted.languages?.length && { languages: extracted.languages }),
      ...(extracted.certifications?.length && { certifications: extracted.certifications }),
      ...(extracted.linkedin && { linkedin: extracted.linkedin }),
      ...(extracted.portfolio && { portfolio: extracted.portfolio }),
      cvFileUrl: `/uploads/cv/${userId}_${Date.now()}.${mimeType === "application/pdf" ? "pdf" : "jpg"}`,
      cvExtractedAt: new Date(),
      cvExtractedByAI: true,
    };

    const seeker = await JobSeeker.findOneAndUpdate(
      { userId },
      { $set: updateData },
      { upsert: true, new: true }
    );

    // Recalculate profile completeness
    const completeness = calculateCompleteness(seeker.toObject(), extracted);
    await JobSeeker.updateOne({ userId }, { $set: { profileCompleteness: completeness } });

    await logActivity({
      actorId: userId,
      actorRole: "job_seeker",
      action: "cv.extract",
      resource: "ai_cv",
      meta: {
        fileType: mimeType,
        fileSize: file.size,
        skillsExtracted: extracted.skills?.length ?? 0,
      },
      req,
    });

    return NextResponse.json({
      success: true,
      extracted,
      profileCompleteness: completeness,
    });
  } catch (err) {
    console.error("[CV Extract]", err);
    if (err instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Failed to parse AI response — try again" },
        { status: 422 }
      );
    }
    return NextResponse.json({ error: "CV extraction failed" }, { status: 500 });
  }
}

function calculateCompleteness(seeker: Record<string, unknown>, extracted: Record<string, unknown>): number {
  let score = 0;
  const fields = [
    { key: "userId", weight: 10 },
    { key: "nationality", weight: 10 },
    { key: "currentLocation", weight: 5 },
    { key: "summary", weight: 10 },
    { key: "skills", weight: 20, isArray: true },
    { key: "experience", weight: 20, isArray: true },
    { key: "education", weight: 15, isArray: true },
    { key: "languages", weight: 5, isArray: true },
    { key: "linkedin", weight: 5 },
  ];

  for (const f of fields) {
    const val = seeker[f.key] ?? extracted[f.key === "summary" ? "headline" : f.key];
    if (f.isArray ? Array.isArray(val) && (val as unknown[]).length > 0 : val) {
      score += f.weight;
    }
  }

  return Math.min(100, score);
}
