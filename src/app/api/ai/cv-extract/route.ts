import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { enforceDailyAiQuota } from "@/lib/ai/dailyQuota";
import { enforceFeatureGate } from "@/lib/subscription/featureGate";
import { connectDB } from "@/lib/db/mongoose";
import JobSeeker from "@/models/JobSeeker";
import User, { type UserRole } from "@/models/User";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { logActivity } from "@/lib/audit/log";
import { validateUploadedFile } from "@/lib/security/file-validation";
import { scanForMalware } from "@/lib/security/malware-scan";
import { AI_TOKEN_LIMITS } from "@/lib/ai/sanitize";
import { generateMultimodal, generateText, GEMINI_MODELS } from "@/lib/ai/gemini";
import { uploadBuffer } from "@/lib/storage/spaces";
import mammoth from "mammoth";
import { createHash } from "crypto";
import logger from "@/lib/logger";
import { profileCompletenessScore } from "@/lib/jobSeeker/profileCompleteness";
import { extractResumeText } from "@/lib/ats/analyzeCv";
import { saveReadCv } from "@/lib/cv/cvDocuments";
import {
  CV_PARSE_PROMPT,
  MAX_CV_TEXT,
  MIN_TEXT_LAYER_CHARS,
  cvTextFromParsed,
  normalizeParsedCv,
} from "@/lib/cv/parsedCv";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session.user as unknown as { role: UserRole }).role;

  // Subscription feature gate
  const gateErr = await enforceFeatureGate(session.user.id!, role, { type: "ai", feature: "ai_cv_extraction" });
  if (gateErr) return gateErr;

  if (role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Rate limit upload/AI calls
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown";
  const { allowed } = await checkRateLimit(
    `cv-extract:${session.user.id ?? ip}`,
    RATE_LIMIT_CONFIGS.upload
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  const __aiQuota = await enforceDailyAiQuota(session.user.id!, role);
  if (__aiQuota) return __aiQuota;

  try {
    const formData = await req.formData();
    const file = formData.get("cv") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file: size, MIME whitelist, and magic bytes
    const bytes = await file.arrayBuffer();
    const validationError = validateUploadedFile(file, "cv", bytes);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    // Malware scan before the file is sent to the AI model (fail-closed).
    const scan = await scanForMalware(bytes);
    if (!scan.clean) {
      return NextResponse.json({ error: scan.reason }, { status: 422 });
    }

    // Duplicate detection: skip the (costly) AI extraction if this exact CV
    // file was already parsed for this user. Content hash of the raw bytes.
    const contentHash = createHash("sha256").update(Buffer.from(bytes)).digest("hex");
    await connectDB();
    const existing = await JobSeeker.findOne(
      { userId: session.user.id },
      { "cv.contentHash": 1, "cv.originalUrl": 1, profileCompleteness: 1 }
    ).lean();
    if (existing?.cv?.contentHash === contentHash) {
      return NextResponse.json({
        success: true,
        duplicate: true,
        message: "This CV was already processed — extraction skipped.",
        profileCompleteness: existing.profileCompleteness ?? 0,
        cvUrl: existing.cv?.originalUrl ?? null,
      });
    }

    const mimeType = file.type;

    // One prompt for this route and the background CV reader (lib/cv/parsedCv.ts).
    const prompt = CV_PARSE_PROMPT;

    let text = "";
    // The file's own text, kept for the ATS below.
    let layerText = "";

    if (mimeType === DOCX_MIME) {
      let extractedDocText = "";
      try {
        extractedDocText = (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value.trim();
      } catch {
        return NextResponse.json(
          { error: "Invalid or corrupted DOCX file." },
          { status: 400 }
        );
      }

      if (!extractedDocText) {
        return NextResponse.json(
          { error: "Could not extract readable text from DOCX file." },
          { status: 400 }
        );
      }
      layerText = extractedDocText;

      text = (await generateText(
        `${prompt}\n\nCV text:\n${extractedDocText}`,
        GEMINI_MODELS.flash,
        AI_TOKEN_LIMITS.cv_extract
      )).trim();
    } else {
      // Use multimodal path for PDF/image uploads.
      const base64 = Buffer.from(bytes).toString("base64");
      text = (await generateMultimodal(
        [
          { text: prompt },
          { inlineData: { mimeType, data: base64 } },
        ],
        GEMINI_MODELS.flash,
        AI_TOKEN_LIMITS.cv_extract
      )).trim();
    }

    // Strip markdown code fences if present
    const jsonStr = text.startsWith("`")
      ? text.replace(/```json?\n?/g, "").replace(/```\s*$/g, "").trim()
      : text;

    const extracted = JSON.parse(jsonStr);

    // Save extracted data to JobSeeker profile
    await connectDB();
    const userId = session.user.id;

    // Map AI output shapes → JobSeeker schema shapes — the same reading the
    // background CV reader stores (lib/cv/parsedCv.ts).
    const reading = normalizeParsedCv(extracted);
    const mappedSkills = reading.skills;
    const mappedExperience = reading.experience;
    const mappedEducation = reading.education;
    const mappedLanguages = reading.languages;

    // What the ATS searches: the text layer, or for a scan the reading written out.
    if (!layerText) {
      try {
        layerText = (await extractResumeText(Buffer.from(bytes), mimeType)).text;
      } catch {
        layerText = "";
      }
    }
    const hasLayer = layerText.length >= MIN_TEXT_LAYER_CHARS;
    const cvText = (hasLayer ? layerText : cvTextFromParsed(reading)).slice(0, MAX_CV_TEXT);

    const mappedProjects = extracted.projects?.length
      ? extracted.projects.map((p: {
          title?: string; description?: string; techStack?: string[];
          projectUrl?: string; repoUrl?: string;
        }) => ({
          title: p.title ?? "",
          description: p.description ?? "",
          techStack: p.techStack ?? [],
          projectUrl: p.projectUrl ?? "",
          repoUrl: p.repoUrl ?? "",
        }))
      : [];

    const mappedSocialLinks: { label: string; url: string }[] = [];
    // Map legacy linkedin/portfolio fields if present
    if (extracted.linkedin) mappedSocialLinks.push({ label: "LinkedIn", url: extracted.linkedin });
    if (extracted.portfolio) mappedSocialLinks.push({ label: "Portfolio", url: extracted.portfolio });
    // Map new socialLinks array
    if (extracted.socialLinks?.length) {
      for (const link of extracted.socialLinks as { label?: string; url?: string }[]) {
        if (link.url && !mappedSocialLinks.some((s) => s.url === link.url)) {
          mappedSocialLinks.push({ label: link.label ?? "Link", url: link.url });
        }
      }
    }

    const updateData = {
      ...(extracted.fullName && { fullName: extracted.fullName }),
      ...(extracted.headline && { summary: extracted.headline }),
      ...(extracted.nationality && { nationality: extracted.nationality }),
      ...(extracted.currentLocation && { currentLocation: extracted.currentLocation }),
      ...(mappedSkills.length && { skills: mappedSkills }),
      ...(mappedExperience.length && { experience: mappedExperience }),
      ...(mappedEducation.length && { education: mappedEducation }),
      ...(mappedLanguages.length && { languages: mappedLanguages }),
      ...(extracted.certifications?.length && { certifications: extracted.certifications }),
      ...(mappedProjects.length && { projects: mappedProjects }),
      ...(mappedSocialLinks.length && { socialLinks: mappedSocialLinks }),
      cvExtractedAt: new Date(),
      cvExtractedByAI: true,
    };

    // Also update User.name if fullName was extracted
    if (extracted.fullName) {
      await User.findByIdAndUpdate(userId, { name: extracted.fullName }, { runValidators: true });
    }

    // Persist the content hash so an identical re-upload is detected as duplicate.
    (updateData as Record<string, unknown>)["cv.contentHash"] = contentHash;

    // Upload CV file to Spaces and store real URL
    try {
      const uploaded = await uploadBuffer(Buffer.from(bytes), {
        folder: "cvs",
        fileName: file.name,
        contentType: mimeType,
        private: true, // CVs are private PII — never public-read; serve via presigned URL
        skipMalwareScan: true, // already scanned above
      });
      (updateData as Record<string, unknown>)["cv.originalUrl"] = uploaded.url;
      (updateData as Record<string, unknown>)["cv.parsedAt"] = new Date();
      // New CV file → old ATS analysis is stale; clear it so the next check re-parses.
      (updateData as Record<string, unknown>)["cv.atsScore"] = null;
      (updateData as Record<string, unknown>)["cv.atsReport"] = null;
      (updateData as Record<string, unknown>)["cv.atsAnalyzedAt"] = null;
      // This file's text — the matcher's CV evidence (it used to be wiped here).
      (updateData as Record<string, unknown>)["cv.rawText"] = cvText;
    } catch {
      // Non-fatal — extraction data still saved even if file upload fails
      logger.warn("[CV Extract] File upload to Spaces failed — continuing without storing URL");
    }

    const seeker = await JobSeeker.findOneAndUpdate(
      { userId },
      { $set: updateData },
      { upsert: true, returnDocument: "after" }
    );

    // Record the reading, so the ATS scores applications on this CV without
    // paying to read it a second time.
    const storedUrl = (updateData as Record<string, unknown>)["cv.originalUrl"] as string | undefined;
    if (storedUrl) {
      try {
        await saveReadCv({
          jobSeekerId: seeker._id,
          userId,
          fileUrl: storedUrl,
          fileName: file.name,
          mimeType,
          size: file.size,
          fingerprint: contentHash,
          source: "profile",
          text: cvText,
          textSource: hasLayer ? "text_layer" : "ai_vision",
          parsed: reading,
        });
      } catch (err) {
        logger.error({ err, userId }, "[CV Extract] failed to record the CV reading");
      }
    }

    // Recalculate profile completeness
    const completeness = profileCompletenessScore(seeker.toObject(), extracted);
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
      cvUrl: (updateData as Record<string, unknown>)["cv.originalUrl"] ?? null,
    });
  } catch (err) {
    logger.error({ err }, "[CV Extract]");
    if (err instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Failed to parse AI response — try again" },
        { status: 422 }
      );
    }
    return NextResponse.json({ error: "CV extraction failed" }, { status: 500 });
  }
}

