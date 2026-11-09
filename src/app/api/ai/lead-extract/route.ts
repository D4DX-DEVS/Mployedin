import { NextRequest, NextResponse } from "next/server";
import { withAiContext } from "@/lib/ai/usageContext";
import mammoth from "mammoth";
import { auth } from "@/lib/auth/config";
import { enforceDailyAiQuota } from "@/lib/ai/dailyQuota";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { getClientIp } from "@/lib/security/clientIp";
import { validateUploadedFile } from "@/lib/security/file-validation";
import { scanForMalware } from "@/lib/security/malware-scan";
import { AI_TOKEN_LIMITS } from "@/lib/ai/sanitize";
import { extractionModel, generateMultimodal, generateText, parseAIJson } from "@/lib/ai/gemini";
import { extractResumeText } from "@/lib/ats/analyzeCv";
import { MIN_TEXT_LAYER_CHARS } from "@/lib/cv/parsedCv";
import { uploadBuffer } from "@/lib/storage/spaces";
import { LEAD_POSTER_PROMPT, normalizeLeadExtraction, sealPosterToken } from "@/lib/leads/posterExtract";
import type { UserRole } from "@/models/User";
import logger from "@/lib/logger";

/**
 * POST /api/ai/lead-extract — an agent drops a hiring poster (image, PDF or
 * DOCX) and gets back the New Lead form's values, the roles being hired, the
 * fields to double-check, and a sealed token for the stored poster that
 * POST /api/leads attaches to the lead. One paid AI call per file, counted
 * against the daily AI quota. Nothing is saved as a lead here: the agent
 * checks the values first.
 */

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const ALLOWED = ["application/pdf", "image/jpeg", "image/png", "image/webp", DOCX_MIME];
// The answer is small (one company, a role list); the CV budget is far more than enough.
const MAX_OUTPUT_TOKENS = Math.min(AI_TOKEN_LIMITS.cv_extract ?? 4000, 4000);

async function handlePOST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const role = (session.user as unknown as { role: UserRole }).role;
  // Leads belong to an agent profile (POST /api/leads), so only agents create them.
  if (role !== "agent") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { allowed } = await checkRateLimit(`lead-extract:${userId ?? getClientIp(req.headers)}`, RATE_LIMIT_CONFIGS.upload);
  if (!allowed) return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });

  const quota = await enforceDailyAiQuota(userId, role, req.nextUrl.pathname);
  if (quota) return quota;

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "No file provided" }, { status: 400 });
    if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "File too large. Maximum 10MB." }, { status: 400 });
    const mimeType = file.type;
    if (!ALLOWED.includes(mimeType)) {
      return NextResponse.json({ error: "Invalid file type. Accepted: PDF, JPEG, PNG, WebP, DOCX." }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    if (mimeType !== DOCX_MIME) {
      const invalid = validateUploadedFile(file, "cv", bytes);
      if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
    }
    // Before the paid call and before storage (fail-closed).
    const scan = await scanForMalware(bytes);
    if (!scan.clean) return NextResponse.json({ error: scan.reason }, { status: 422 });

    const buffer = Buffer.from(bytes);
    let answer: string;
    if (mimeType === DOCX_MIME) {
      let docText = "";
      try {
        docText = (await mammoth.extractRawText({ buffer })).value.trim();
      } catch {
        return NextResponse.json({ error: "Invalid or corrupted DOCX file." }, { status: 400 });
      }
      if (!docText) return NextResponse.json({ error: "Could not extract readable text from the file." }, { status: 400 });
      answer = await generateText(`${LEAD_POSTER_PROMPT}\n\nDocument text:\n${docText.slice(0, 15000)}`, extractionModel(), MAX_OUTPUT_TOKENS);
    } else {
      // A PDF's own text first (exact and cheap); scans and images go to vision.
      let layerText = "";
      if (mimeType === "application/pdf") {
        layerText = await extractResumeText(buffer, mimeType).then((r) => r.text).catch(() => "");
      }
      answer = layerText.length >= MIN_TEXT_LAYER_CHARS
        ? await generateText(`${LEAD_POSTER_PROMPT}\n\nDocument text:\n${layerText.slice(0, 15000)}`, extractionModel(), MAX_OUTPUT_TOKENS)
        : await generateMultimodal(
            [{ text: LEAD_POSTER_PROMPT }, { inlineData: { mimeType, data: buffer.toString("base64") } }],
            extractionModel(),
            MAX_OUTPUT_TOKENS,
          );
    }

    let raw: unknown;
    try {
      raw = parseAIJson<unknown>(answer.trim());
    } catch {
      return NextResponse.json({ error: "NOT_READABLE" }, { status: 422 });
    }
    const extraction = normalizeLeadExtraction(raw);
    if (!extraction) return NextResponse.json({ error: "NOT_A_HIRING_POSTER" }, { status: 422 });

    // Keep the poster with the lead. Private folder; best effort — the details
    // are still worth returning if storage is down.
    let posterToken: string | null = null;
    try {
      const stored = await uploadBuffer(buffer, {
        folder: "documents",
        fileName: file.name,
        contentType: mimeType,
        private: true,
        skipMalwareScan: true,
      });
      posterToken = sealPosterToken({ key: stored.key, name: file.name.slice(0, 255), mimeType, size: stored.size }, userId);
    } catch (err) {
      logger.error({ err }, "[Lead Extract] Poster storage failed");
    }

    return NextResponse.json({ ...extraction, posterToken, posterName: file.name });
  } catch (err) {
    logger.error({ err }, "[Lead Extract] Error");
    return NextResponse.json({ error: "We couldn't read this file. Please try again." }, { status: 500 });
  }
}

export const POST = withAiContext(handlePOST);
