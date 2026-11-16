import { NextRequest, NextResponse } from "next/server";
import { withAiContext } from "@/lib/ai/usageContext";
import { auth } from "@/lib/auth/config";
import { enforceDailyAiQuota } from "@/lib/ai/dailyQuota";
import { enforceFeatureGate } from "@/lib/subscription/featureGate";
import { connectDB } from "@/lib/db/mongoose";
import JobSeeker from "@/models/JobSeeker";
import User, { type UserRole } from "@/models/User";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { getClientIp } from "@/lib/security/clientIp";
import { logActivity } from "@/lib/audit/log";
import { validateUploadedFile } from "@/lib/security/file-validation";
import { scanForMalware } from "@/lib/security/malware-scan";
import { AI_TOKEN_LIMITS } from "@/lib/ai/sanitize";
import { generateText, GEMINI_MODELS } from "@/lib/ai/gemini";
import { EmptyOcrError, ocrDocument } from "@/lib/ai/visionOcr";
import { cleanContact } from "@/lib/cv/contactValidation";
import { deleteFile, uploadBuffer } from "@/lib/storage/spaces";
import mammoth from "mammoth";
import { createHash } from "crypto";
import logger from "@/lib/logger";
import { profileCompletenessScore } from "@/lib/jobSeeker/profileCompleteness";
import { cleanSocialLinks } from "@/lib/jobSeeker/socialLinks";
import { extractResumeText } from "@/lib/ats/analyzeCv";
import { saveReadCv } from "@/lib/cv/cvDocuments";
import { totalExperience } from "@/lib/jobseekers/experience";
import { areaFromCv, pickCurrentExperience, splitCvPhone } from "@/lib/onboarding/cvPrefill";
import { countryKeyFromLocationText } from "@/lib/i18n/locations";
import { ensureIndustryClassified } from "@/lib/jobseekers/ensureIndustryClassified";
import CvDocument from "@/models/CvDocument";
import {
  CV_PARSE_PROMPT,
  MAX_CV_TEXT,
  MIN_TEXT_LAYER_CHARS,
  cvTextFromParsed,
  normalizeParsedCv,
} from "@/lib/cv/parsedCv";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

async function handlePOST(req: NextRequest) {
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
  const ip = getClientIp(req.headers);
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

  const __aiQuota = await enforceDailyAiQuota(session.user.id!, role, req.nextUrl.pathname);
  if (__aiQuota) return __aiQuota;

  try {
    const formData = await req.formData();
    const file = formData.get("cv") as File | null;
    // "preview": read the file and hand the reading back without touching the
    // profile, the account name or the stored CV — the CV Builder and the
    // Documents page save only when the seeker confirms. No mode keeps the
    // one-step fill onboarding and Easy Apply rely on.
    const previewOnly = formData.get("mode") === "preview";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // How long each step took, logged once at the end (CV reads felt slow).
    const startedAt = Date.now();
    const took: Record<string, number> = {};
    const mark = (step: string, since: number) => { took[step] = Date.now() - since; };

    // Validate file: size, MIME whitelist, and magic bytes
    const bytes = await file.arrayBuffer();
    const validationError = validateUploadedFile(file, "cv", bytes);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    // Malware scan before the file is sent to the AI model (fail-closed).
    const scanStart = Date.now();
    const scan = await scanForMalware(bytes);
    mark("scan", scanStart);
    const textStart = Date.now();
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
      // Hand back the reading saved the first time, so the form can fill in
      // again: with none, onboarding said it "could not extract" a CV it had
      // read. Best-effort — the duplicate answer stands without it.
      let saved: unknown = null;
      try {
        const doc = await CvDocument.findOne({ jobSeekerId: existing._id, fingerprint: contentHash, status: "processed" })
          .sort({ processedAt: -1 })
          .select("parsed")
          .lean<{ parsed?: unknown } | null>();
        saved = doc?.parsed ?? null;
      } catch (err) {
        logger.warn({ err }, "[CV Extract] couldn't load the saved reading for a re-upload");
      }
      return NextResponse.json({
        success: true,
        duplicate: true,
        message: "This CV was already processed — extraction skipped.",
        profileCompleteness: existing.profileCompleteness ?? 0,
        cvUrl: existing.cv?.originalUrl ?? null,
        extracted: saved,
      });
    }

    const mimeType = file.type;

    // One prompt for this route and the background CV reader (lib/cv/parsedCv.ts).
    const prompt = CV_PARSE_PROMPT;

    // The file's own text, kept for the ATS below.
    let layerText = "";
    // A scan's transcription, when the file had no usable text layer.
    let ocrText = "";

    if (mimeType === DOCX_MIME) {
      try {
        layerText = (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value.trim();
      } catch {
        return NextResponse.json(
          { error: "Invalid or corrupted DOCX file." },
          { status: 400 }
        );
      }

      if (!layerText) {
        return NextResponse.json(
          { error: "Could not extract readable text from DOCX file." },
          { status: 400 }
        );
      }
    } else {
      // PDF or image. The file's own text first: exact, free and instant
      // (2026-10-15: OCR changed characters in contact details the text layer
      // had right). Only a scan, or a PDF with almost no text, is transcribed.
      try {
        layerText = (await extractResumeText(Buffer.from(bytes), mimeType)).text;
      } catch {
        layerText = "";
      }
      if (layerText.length < MIN_TEXT_LAYER_CHARS) {
        try {
          ocrText = await ocrDocument(Buffer.from(bytes), mimeType);
        } catch (err) {
          if (!(err instanceof EmptyOcrError)) throw err;
          logger.info({ mimeType, layerChars: layerText.length }, "[CV Extract] the scan transcribed to no text");
          // A short text layer is still something to parse (below). With
          // neither, the file is blank or unreadable: nothing is parsed or saved.
          if (!layerText.trim()) {
            return NextResponse.json(
              { error: "Couldn't read any text from this file. Try a clearer scan, or a PDF with selectable text." },
              { status: 422 }
            );
          }
        }
      }
    }

    mark("text", textStart);

    // The file goes to storage while the AI reads it, rather than after: the two
    // do not depend on each other. Not for "preview", which stores nothing. If
    // the read fails, the stored copy is removed again. Only once the file is
    // known to hold text: a blank scan is refused above with nothing stored.
    const uploadStart = Date.now();
    const uploadPromise: Promise<string | null> = previewOnly
      ? Promise.resolve(null)
      : uploadBuffer(Buffer.from(bytes), {
          folder: "cvs",
          fileName: file.name,
          contentType: mimeType,
          private: true, // CVs are private PII — never public-read; serve via presigned URL
          skipMalwareScan: true, // already scanned above
        }).then(
          (uploaded) => { mark("upload", uploadStart); return uploaded.url; },
          () => {
            // Non-fatal — extraction data still saved even if file upload fails
            logger.warn("[CV Extract] File upload to Spaces failed — continuing without storing URL");
            return null;
          },
        );
    const dropUpload = () => {
      void uploadPromise.then((url) => (url ? deleteFile(url) : undefined)).catch(() => undefined);
    };

    // One parse call for every file type, on the best text there is.
    const sourceText = layerText.length >= MIN_TEXT_LAYER_CHARS ? layerText : ocrText || layerText;
    const aiStart = Date.now();
    let text: string;
    try {
      text = (await generateText(
      `${prompt}\n\nCV text:\n${sourceText}`,
      GEMINI_MODELS.flash,
      AI_TOKEN_LIMITS.cv_extract,
      true
    )).trim();
    } catch (err) {
      dropUpload();
      throw err;
    }
    mark("ai", aiStart);

    // Strip markdown code fences if present
    const jsonStr = text.startsWith("`")
      ? text.replace(/```json?\n?/g, "").replace(/```\s*$/g, "").trim()
      : text;

    let extracted;
    try {
      extracted = JSON.parse(jsonStr);
    } catch (err) {
      dropUpload();
      throw err;
    }

    // Contact details are checked before anything shows or stores them. A
    // value that fails is dropped for the seeker to fill in, never guessed.
    const contact = cleanContact({ email: extracted.email, phone: extracted.phone });
    extracted.email = contact.email;
    extracted.phone = contact.phone;
    if (contact.dropped.length) {
      // Field names only: the values are personal data.
      logger.info({ dropped: contact.dropped, scan: Boolean(ocrText) }, "[CV Extract] dropped malformed contact details");
    }

    if (previewOnly) {
      await logActivity({
        actorId: session.user.id!,
        actorRole: "job_seeker",
        action: "cv.extract",
        resource: "ai_cv",
        meta: {
          fileType: mimeType,
          fileSize: file.size,
          skillsExtracted: extracted.skills?.length ?? 0,
          preview: true,
        },
        req,
      });
      return NextResponse.json({ success: true, preview: true, extracted });
    }

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

    // What the ATS searches: the file's own text, else the scan's
    // transcription, else (a near-empty DOCX) the reading written out.
    const hasLayer = layerText.length >= MIN_TEXT_LAYER_CHARS;
    const cvText = (hasLayer ? layerText : ocrText || cvTextFromParsed(reading)).slice(0, MAX_CV_TEXT);

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

    // The reader returns a link's visible text when the PDF hides its address
    // ("LinkedIn"); stored as-is, that one entry failed every later profile save.
    const mappedSocialLinks = cleanSocialLinks([
      // Legacy linkedin/portfolio fields, then the socialLinks array
      ...(extracted.linkedin ? [{ label: "LinkedIn", url: extracted.linkedin }] : []),
      ...(extracted.portfolio ? [{ label: "Portfolio", url: extracted.portfolio }] : []),
      ...(Array.isArray(extracted.socialLinks) ? extracted.socialLinks : []),
    ]);

    const cvTotal = mappedExperience.length ? totalExperience(extracted.totalExperienceYears, mappedExperience) : null;
    const updateData = {
      ...(extracted.fullName && { fullName: extracted.fullName }),
      ...(extracted.headline && { summary: extracted.headline }),
      ...(extracted.nationality && { nationality: extracted.nationality }),
      ...(extracted.currentLocation && { currentLocation: extracted.currentLocation }),
      ...(mappedSkills.length && { skills: mappedSkills }),
      ...(mappedExperience.length && { experience: mappedExperience }),
      // What the CV states ("6+ years"), else its dated jobs added up: onboarding
      // asks this, and a CV that answers it must not be asked again.
      ...(cvTotal && { totalExperienceYears: cvTotal.years, totalExperienceMonths: cvTotal.months }),
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

    // The CV's phone, as "+<code><number>", for an account that has none — so
    // onboarding and the apply form show it instead of asking. Only a number
    // whose country can be told (written with its code, or read in the
    // country the CV names); a number the seeker typed is never replaced.
    const cvPhone = splitCvPhone(extracted.phone, areaFromCv({ location: extracted.currentLocation })?.countryCode);
    if (cvPhone?.dialCode && cvPhone.phone.length >= 6) {
      await User.updateOne(
        { _id: userId, $or: [{ phone: { $exists: false } }, { phone: null }, { phone: "" }] },
        { $set: { phone: `${cvPhone.dialCode}${cvPhone.phone}` } },
      );
    }

    // Persist the content hash so an identical re-upload is detected as duplicate.
    (updateData as Record<string, unknown>)["cv.contentHash"] = contentHash;

    // The stored file (its upload started before the AI read the CV).
    const uploadedUrl = await uploadPromise;
    if (uploadedUrl) {
      (updateData as Record<string, unknown>)["cv.originalUrl"] = uploadedUrl;
      (updateData as Record<string, unknown>)["cv.parsedAt"] = new Date();
      // New CV file → old ATS analysis is stale; clear it so the next check re-parses.
      (updateData as Record<string, unknown>)["cv.atsScore"] = null;
      (updateData as Record<string, unknown>)["cv.atsReport"] = null;
      (updateData as Record<string, unknown>)["cv.atsAnalyzedAt"] = null;
      // This file's text — the matcher's CV evidence (it used to be wiped here).
      (updateData as Record<string, unknown>)["cv.rawText"] = cvText;
    }

    const seeker = await JobSeeker.findOneAndUpdate(
      { userId },
      { $set: updateData },
      { upsert: true, returnDocument: "after" }
    );

    // Preferences, for an account that has none: a seeker who applies with a
    // CV is marked onboarded and never reaches the step that asks them, so
    // job matching and alerts had nothing to go on. The job they hold now and
    // where they live; each is only filled while empty, never overwritten.
    const wantedRole = pickCurrentExperience(mappedExperience)?.jobTitle?.trim();
    const homeTown = String(extracted.currentLocation ?? "").split(",")[0]?.trim();
    const homeCountry = countryKeyFromLocationText(extracted.currentLocation);
    const prefs: Record<string, string[]> = {};
    if (wantedRole && !seeker?.preferredRoles?.length) prefs.preferredRoles = [wantedRole.slice(0, 120)];
    if (homeTown && !seeker?.preferredLocations?.length) prefs.preferredLocations = [homeTown.slice(0, 120)];
    if (homeCountry && !seeker?.preferredCountries?.length) prefs.preferredCountries = [homeCountry];
    if (Object.keys(prefs).length) await JobSeeker.updateOne({ userId }, { $set: prefs });

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

    // Auto-classify industry from extracted/updated profile (unless manually set)
    await ensureIndustryClassified(seeker);

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

    took.total = Date.now() - startedAt;
    logger.info({ ms: took, scan: Boolean(ocrText) }, "[CV Extract] timings");

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

export const POST = withAiContext(handlePOST);
