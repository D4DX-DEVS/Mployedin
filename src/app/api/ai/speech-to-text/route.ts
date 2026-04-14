import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Google Cloud Speech-to-Text REST API (used for manual language selection)
const SPEECH_API_URL =
  "https://speech.googleapis.com/v1/speech:recognize";

// Gemini direct — used for auto-detect mode (multilingual audio understanding)
const geminiAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

const SUPPORTED_LANGUAGES: Record<string, string> = {
  auto: "auto",
  en: "en-US",
  ar: "ar-SA",
  ml: "ml-IN",         // Malayalam
  hi: "hi-IN",         // Hindi
  ur: "ur-PK",         // Urdu
  ta: "ta-IN",         // Tamil
  te: "te-IN",         // Telugu
  "en-US": "en-US",
  "ar-SA": "ar-SA",
  "ml-IN": "ml-IN",
  "hi-IN": "hi-IN",
  "ur-PK": "ur-PK",
  "ta-IN": "ta-IN",
  "te-IN": "te-IN",
};

// Google enhanced models only exist for these language codes (v1 Speech API).
// For all other languages, useEnhanced silently falls back and can degrade accuracy.
const ENHANCED_SUPPORTED = new Set(["en-US", "hi-IN"]);

// All supported language codes (used for auto-detect alternatives)
const ALL_LANGUAGE_CODES = ["ml-IN", "en-US", "ar-SA", "hi-IN", "ta-IN", "te-IN", "ur-PK"];

const MAX_AUDIO_BYTES = 5 * 1024 * 1024; // 5 MB

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip =
      req.headers.get("x-forwarded-for") ??
      req.headers.get("x-real-ip") ??
      "unknown";
    const { allowed, remaining, resetAt } = checkRateLimit(
      `ai-speech:${(session.user as unknown as { id: string }).id ?? ip}`,
      RATE_LIMIT_CONFIGS.ai
    );
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil((resetAt - Date.now()) / 1000)),
          },
        }
      );
    }

    // Read audio from form data
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;
    const rawLocale = (formData.get("language") as string | null) ?? "auto";
    const isAutoDetect = rawLocale === "auto";
    const languageCode = SUPPORTED_LANGUAGES[rawLocale] ?? "en-US";

    if (!audioFile) {
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
    }

    if (audioFile.size > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        { error: "Audio file too large (max 5 MB)" },
        { status: 413 }
      );
    }

    // Reject blobs that are obviously empty (just container headers, no audio frames).
    const MIN_AUDIO_BYTES = 500;
    if (audioFile.size < MIN_AUDIO_BYTES) {
      return NextResponse.json(
        { error: "No voice detected. Please hold the mic button and speak clearly." },
        { status: 422 }
      );
    }

    const audioBuffer = await audioFile.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString("base64");

    // ─── AUTO-DETECT MODE: Use Gemini for multilingual audio transcription ───
    if (isAutoDetect) {
      const geminiKey = process.env.GEMINI_API_KEY;
      if (!geminiKey) {
        return NextResponse.json(
          { error: "Speech service not configured" },
          { status: 503 }
        );
      }

      try {
        const mimeType = audioFile.type || "audio/webm";
        // Gemini supports audio/wav, audio/mp3, audio/aac, audio/ogg, audio/flac
        // For webm, we pass as-is — Gemini handles it via media processing
        const geminiMime = mimeType.includes("webm")
          ? "audio/webm"
          : mimeType.includes("ogg")
            ? "audio/ogg"
            : mimeType.includes("mp4") || mimeType.includes("m4a")
              ? "audio/mp4"
              : mimeType;

        const model = geminiAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const result = await model.generateContent([
          {
            inlineData: {
              mimeType: geminiMime,
              data: audioBase64,
            },
          },
          {
            text: `Transcribe this audio exactly as spoken. The speaker may use Malayalam, English, Hindi, Arabic, Tamil, Telugu, Urdu, or any mix of these languages.

Rules:
- Output ONLY the transcription, nothing else
- Keep the original language as spoken (do NOT translate)
- If the speaker mixes languages (e.g. Malayalam with English words), keep the mix exactly as spoken
- If you cannot understand the audio, respond with exactly: [EMPTY]
- Do not add timestamps, labels, or any formatting
- First line: the detected primary language code (e.g. ml, en, hi, ar, ta, te, ur)
- Second line: the transcription`,
          },
        ]);

        const responseText = result.response.text().trim();

        if (!responseText || responseText === "[EMPTY]") {
          return NextResponse.json(
            { transcript: "", language: "auto" },
            { headers: { "X-RateLimit-Remaining": String(remaining) } }
          );
        }

        // Parse: first line = language code, rest = transcript
        const lines = responseText.split("\n");
        let detectedLang = "auto";
        let transcript = responseText;

        if (lines.length >= 2) {
          const firstLine = lines[0].trim().toLowerCase();
          // Check if first line looks like a language code
          if (/^(ml|en|hi|ar|ta|te|ur)(-[a-z]{2})?$/i.test(firstLine)) {
            detectedLang = firstLine.replace(/-.*/, ""); // normalize ml-IN → ml
            transcript = lines.slice(1).join("\n").trim();
          }
        }

        // Map short code to BCP-47 for the response
        const langMap: Record<string, string> = {
          ml: "ml-IN", en: "en-US", hi: "hi-IN", ar: "ar-SA",
          ta: "ta-IN", te: "te-IN", ur: "ur-PK",
        };

        return NextResponse.json(
          { transcript, language: langMap[detectedLang] ?? "auto" },
          { headers: { "X-RateLimit-Remaining": String(remaining) } }
        );
      } catch (geminiErr) {
        console.error("[Gemini Speech Error]", geminiErr);
        // Fall through to Google Speech API as fallback
      }
    }

    // ─── MANUAL MODE (or Gemini fallback): Google Cloud Speech-to-Text ───
    const apiKey = process.env.GOOGLE_CLOUD_SPEECH_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Speech service not configured" },
        { status: 503 }
      );
    }

    // Determine encoding from MIME type
    const mimeType = audioFile.type || "audio/webm";
    const encoding = mimeType.includes("webm")
      ? "WEBM_OPUS"
      : mimeType.includes("ogg")
        ? "OGG_OPUS"
        : mimeType.includes("mp4") || mimeType.includes("m4a")
          ? "MP4"
          : "LINEAR16";

    // If auto-detect fell through (Gemini failed), use en-US as fallback for Google Speech
    const speechLangCode = languageCode === "auto" ? "en-US" : languageCode;
    const isIndianLanguage = ["ml-IN", "hi-IN", "ta-IN", "te-IN", "ur-PK"].includes(speechLangCode);
    const model = isAutoDetect ? "default" : isIndianLanguage ? "latest_long" : "latest_short";

    const useEnhanced = ENHANCED_SUPPORTED.has(speechLangCode);

    const requestBody = {
      config: {
        encoding,
        sampleRateHertz: encoding === "WEBM_OPUS" || encoding === "OGG_OPUS" ? undefined : 16000,
        languageCode: speechLangCode,
        alternativeLanguageCodes: isAutoDetect
          ? ALL_LANGUAGE_CODES.filter((l) => l !== speechLangCode).slice(0, 3)
          : isIndianLanguage
            ? ["en-US"]
            : (["ar-SA", "ml-IN", "hi-IN"] as string[])
                .filter((l) => l !== speechLangCode)
                .slice(0, 3),
        enableAutomaticPunctuation: true,
        model,
        ...(useEnhanced ? { useEnhanced: true } : {}),
        // Boost recruitment & tech vocabulary recognition accuracy
        speechContexts: [
          {
            phrases: [
              // Job roles
              "MERN stack", "React developer", "Node.js", "full stack", "backend", "frontend",
              "mobile developer", "Flutter", "React Native", "DevOps", "data scientist",
              "machine learning", "UI UX designer", "product manager", "project manager",
              "HR manager", "sales executive", "digital marketing", "finance manager",
              // Experience
              "years experience", "year experience", "fresher", "entry level", "senior", "junior",
              // Education
              "computer science", "CS", "BSc", "MBA", "engineering", "bachelor", "master",
              // Salary
              "salary", "per month", "CTC", "rupees", "dirhams", "riyals", "dollars",
              "50000", "100000", "lakh", "per annum",
              // Location
              "Dubai", "Abu Dhabi", "Riyadh", "Bangalore", "Mumbai", "remote", "hybrid",
              // Languages (for the input itself being mixed)
              "MERN", "MongoDB", "Express", "Angular", "Vue", "Python", "Django", "Laravel",
              "PHP", "Java", "Spring Boot", "AWS", "Docker", "Kubernetes",
              // Malayalam job-related terms (common in voice input)
              "ജോലി", "ശമ്പളം", "അനുഭവം", "skills", "experience", "salary",
            ],
            boost: 15,
          },
        ],
      },
      audio: {
        content: audioBase64,
      },
    };

    const speechRes = await fetch(`${SPEECH_API_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!speechRes.ok) {
      const errText = await speechRes.text();
      console.error("[Speech API Error]", errText);
      return NextResponse.json(
        { error: "Speech recognition failed" },
        { status: 502 }
      );
    }

    const speechData = await speechRes.json();
    const transcript =
      speechData.results
        ?.flatMap((r: { alternatives?: Array<{ transcript?: string }> }) =>
          r.alternatives?.map((a) => a.transcript ?? "") ?? []
        )
        .join(" ")
        .trim() ?? "";

    return NextResponse.json(
      { transcript, language: speechLangCode },
      {
        headers: {
          "X-RateLimit-Remaining": String(remaining),
        },
      }
    );
  } catch (err) {
    console.error("[Speech-to-Text Error]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
