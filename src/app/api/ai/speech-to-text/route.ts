import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Sonix AI async STT
const SONIX_API_URL = "https://api.sonix.ai/v1/media";

// Google Cloud Speech-to-Text REST API (fallback)
const SPEECH_API_URL = "https://speech.googleapis.com/v1/speech:recognize";

// Gemini — used for auto-detect fallback (multilingual audio understanding)
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

// Sonix uses shorter locale codes
const SONIX_LANGUAGE_MAP: Record<string, string> = {
  "en-US": "en-US",
  "ar-SA": "ar",
  "ml-IN": "ml",
  "hi-IN": "hi",
  "ur-PK": "ur",
  "ta-IN": "ta",
  "te-IN": "te",
};

// Google enhanced models only exist for these language codes (v1 Speech API)
const ENHANCED_SUPPORTED = new Set(["en-US", "hi-IN"]);

// All supported language codes (used for auto-detect alternatives)
const ALL_LANGUAGE_CODES = ["ml-IN", "en-US", "ar-SA", "hi-IN", "ta-IN", "te-IN", "ur-PK"];

const MAX_AUDIO_BYTES = 5 * 1024 * 1024; // 5 MB

// ─── Sonix polling helper ─────────────────────────────────────────────────────
async function trySonixTranscription(
  audioFile: File,
  languageCode: string,
  isAutoDetect: boolean,
  sonixKey: string
): Promise<{ transcript: string; language: string } | null> {
  const ext = audioFile.type.includes("ogg")
    ? "ogg"
    : audioFile.type.includes("mp4") || audioFile.type.includes("m4a")
      ? "m4a"
      : "webm";

  const uploadForm = new FormData();
  uploadForm.append("name", `recording-${Date.now()}.${ext}`);

  // For manual language selection, pass Sonix language code
  if (!isAutoDetect) {
    const sonixLang = SONIX_LANGUAGE_MAP[languageCode] ?? languageCode;
    uploadForm.append("language", sonixLang);
  }

  uploadForm.append("file", audioFile);

  const uploadRes = await fetch(SONIX_API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${sonixKey}` },
    body: uploadForm,
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    console.error("[Sonix Upload Error]", uploadRes.status, err);
    return null;
  }

  const uploadData = await uploadRes.json() as { id: string; status: string; language?: string };
  const mediaId = uploadData.id;

  // Poll until completed (max 15 seconds, 1.5s intervals)
  const deadline = Date.now() + 15000;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));

    const statusRes = await fetch(`${SONIX_API_URL}/${mediaId}`, {
      headers: { Authorization: `Bearer ${sonixKey}` },
    });

    if (!statusRes.ok) break;

    const statusData = await statusRes.json() as { id: string; status: string; language?: string };

    if (statusData.status === "completed") {
      const transcriptRes = await fetch(`${SONIX_API_URL}/${mediaId}/transcript.txt`, {
        headers: { Authorization: `Bearer ${sonixKey}` },
      });

      if (!transcriptRes.ok) break;

      const rawText = await transcriptRes.text();
      const transcript = rawText.trim();

      if (!transcript) return null;

      const detectedLang = statusData.language
        ? (SUPPORTED_LANGUAGES[statusData.language] ?? statusData.language)
        : isAutoDetect
          ? "auto"
          : languageCode;

      return { transcript, language: detectedLang };
    }

    if (statusData.status === "failed") break;
  }

  return null;
}

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

    // Reject blobs that are obviously empty (just container headers, no audio frames)
    const MIN_AUDIO_BYTES = 500;
    if (audioFile.size < MIN_AUDIO_BYTES) {
      return NextResponse.json(
        { error: "No voice detected. Please hold the mic button and speak clearly." },
        { status: 422 }
      );
    }

    // ─── PRIMARY: Sonix AI ────────────────────────────────────────────────────
    const sonixKey = process.env.SONIX_API_KEY;
    if (sonixKey) {
      try {
        const result = await trySonixTranscription(audioFile, languageCode, isAutoDetect, sonixKey);
        if (result) {
          return NextResponse.json(result, {
            headers: { "X-RateLimit-Remaining": String(remaining) },
          });
        }
      } catch (sonixErr) {
        console.error("[Sonix STT Error]", sonixErr);
        // Fall through to Gemini / Google
      }
    }

    const audioBuffer = await audioFile.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString("base64");

    // ─── FALLBACK 1: Gemini (auto-detect mode only) ───────────────────────────
    if (isAutoDetect) {
      const geminiKey = process.env.GEMINI_API_KEY;
      if (geminiKey) {
        try {
          const mimeType = audioFile.type || "audio/webm";
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

          const lines = responseText.split("\n");
          let detectedLang = "auto";
          let transcript = responseText;

          if (lines.length >= 2) {
            const firstLine = lines[0].trim().toLowerCase();
            if (/^(ml|en|hi|ar|ta|te|ur)(-[a-z]{2})?$/i.test(firstLine)) {
              detectedLang = firstLine.replace(/-.*/, "");
              transcript = lines.slice(1).join("\n").trim();
            }
          }

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
          // Fall through to Google Speech API
        }
      }
    }

    // ─── FALLBACK 2: Google Cloud Speech-to-Text ──────────────────────────────
    const apiKey = process.env.GOOGLE_CLOUD_SPEECH_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Speech service not configured" },
        { status: 503 }
      );
    }

    const mimeType = audioFile.type || "audio/webm";
    const encoding = mimeType.includes("webm")
      ? "WEBM_OPUS"
      : mimeType.includes("ogg")
        ? "OGG_OPUS"
        : mimeType.includes("mp4") || mimeType.includes("m4a")
          ? "MP4"
          : "LINEAR16";

    const speechLangCode = languageCode === "auto" ? "en-US" : languageCode;
    const isIndianLanguage = ["ml-IN", "hi-IN", "ta-IN", "te-IN", "ur-PK"].includes(speechLangCode);
    const googleModel = isAutoDetect ? "default" : isIndianLanguage ? "latest_long" : "latest_short";
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
        model: googleModel,
        ...(useEnhanced ? { useEnhanced: true } : {}),
        speechContexts: [
          {
            phrases: [
              "MERN stack", "React developer", "Node.js", "full stack", "backend", "frontend",
              "mobile developer", "Flutter", "React Native", "DevOps", "data scientist",
              "machine learning", "UI UX designer", "product manager", "project manager",
              "HR manager", "sales executive", "digital marketing", "finance manager",
              "years experience", "year experience", "fresher", "entry level", "senior", "junior",
              "computer science", "CS", "BSc", "MBA", "engineering", "bachelor", "master",
              "salary", "per month", "CTC", "rupees", "dirhams", "riyals", "dollars",
              "50000", "100000", "lakh", "per annum",
              "Dubai", "Abu Dhabi", "Riyadh", "Bangalore", "Mumbai", "remote", "hybrid",
              "MERN", "MongoDB", "Express", "Angular", "Vue", "Python", "Django", "Laravel",
              "PHP", "Java", "Spring Boot", "AWS", "Docker", "Kubernetes",
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
      { headers: { "X-RateLimit-Remaining": String(remaining) } }
    );
  } catch (err) {
    console.error("[Speech-to-Text Error]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
