import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";

// Google Cloud Speech-to-Text REST API
// Docs: https://cloud.google.com/speech-to-text/docs/reference/rest/v1/speech/recognize
const SPEECH_API_URL =
  "https://speech.googleapis.com/v1/speech:recognize";

const SUPPORTED_LANGUAGES: Record<string, string> = {
  auto: "en-US",       // Auto-detect: use en-US as primary + all as alternatives
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

// All supported language codes for auto-detection
const ALL_LANGUAGE_CODES = ["en-US", "ar-SA", "ml-IN", "hi-IN", "ta-IN", "te-IN", "ur-PK"];

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

    const apiKey = process.env.GOOGLE_CLOUD_SPEECH_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Speech service not configured" },
        { status: 503 }
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

    const audioBuffer = await audioFile.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString("base64");

    // Determine encoding from MIME type
    const mimeType = audioFile.type || "audio/webm";
    const encoding = mimeType.includes("webm")
      ? "WEBM_OPUS"
      : mimeType.includes("ogg")
        ? "OGG_OPUS"
        : mimeType.includes("mp4") || mimeType.includes("m4a")
          ? "MP4"
          : "LINEAR16";

    // For Indian languages or auto-detect, use "latest_long" which has better multi-language support
    const isIndianLanguage = ["ml-IN", "hi-IN", "ta-IN", "te-IN", "ur-PK"].includes(languageCode);
    const model = isAutoDetect || isIndianLanguage ? "latest_long" : "latest_short";

    const requestBody = {
      config: {
        encoding,
        sampleRateHertz: encoding === "WEBM_OPUS" || encoding === "OGG_OPUS" ? undefined : 16000,
        languageCode,
        // Auto-detect: include all supported languages as alternatives (max 3)
        // Indian language: include English for code-mixing
        // English: include common South Asian languages
        alternativeLanguageCodes: isAutoDetect
          ? ALL_LANGUAGE_CODES.filter((l) => l !== languageCode).slice(0, 3)
          : isIndianLanguage
            ? ["en-US"]
            : (["ar-SA", "ml-IN", "hi-IN"] as string[])
                .filter((l) => l !== languageCode)
                .slice(0, 3),
        enableAutomaticPunctuation: true,
        model,
        useEnhanced: true,
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
      { transcript, language: languageCode },
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
