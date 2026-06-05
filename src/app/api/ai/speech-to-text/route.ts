import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { enforceDailyAiQuota } from "@/lib/ai/dailyQuota";
import { enforceFeatureGate } from "@/lib/subscription/featureGate";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { logActivity } from "@/lib/audit/log";

// Soniox real-time Speech-to-Text via WebSocket
const SONIOX_WS_URL = "wss://stt-rt.soniox.com/transcribe-websocket";

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

// Soniox language hint codes (ISO 639-1 short forms)
const SONIOX_LANGUAGE_HINTS: Record<string, string> = {
  "en-US": "en",
  "ar-SA": "ar",
  "ml-IN": "ml",
  "hi-IN": "hi",
  "ur-PK": "ur",
  "ta-IN": "ta",
  "te-IN": "te",
};

// Map Soniox short code → full BCP-47 locale
const SONIOX_TO_LOCALE: Record<string, string> = {
  en: "en-US",
  ar: "ar-SA",
  ml: "ml-IN",
  hi: "hi-IN",
  ur: "ur-PK",
  ta: "ta-IN",
  te: "te-IN",
};

// Google enhanced models only exist for these language codes (v1 Speech API)
const ENHANCED_SUPPORTED = new Set(["en-US", "hi-IN"]);

// All supported language codes (used for auto-detect alternatives)
const ALL_LANGUAGE_CODES = ["ml-IN", "en-US", "ar-SA", "hi-IN", "ta-IN", "te-IN", "ur-PK"];

const MAX_AUDIO_BYTES = 5 * 1024 * 1024; // 5 MB

// Strip LLM stop-token artifacts that occasionally appear at the end of transcriptions
// (e.g. Gemini sometimes appends "<end>", "[END]", "[end]" as completion markers)
function cleanTranscript(text: string): string {
  return text
    .replace(/<\/?end>/gi, "")
    .replace(/\[end\]/gi, "")
    .replace(/\[END_OF_TRANSCRIPTION\]/gi, "")
    .replace(/\[DONE\]/gi, "")
    .trim();
}

// ─── Soniox real-time WebSocket helper ───────────────────────────────────────
// Uses Soniox's real-time STT API with auto language identification.
// Pass languageCode=null for full auto-detect.
async function trySonioxTranscription(
  audioFile: File,
  languageCode: string | null,
  sonioxKey: string
): Promise<{ transcript: string; language: string } | null> {
  const arrayBuffer = await audioFile.arrayBuffer();
  const audioBytes = new Uint8Array(arrayBuffer);

  return new Promise((resolve) => {
    const ws = new WebSocket(SONIOX_WS_URL);
    const finalTokens: string[] = [];
    let detectedLang: string | null = null;
    let settled = false;

    const done = (result: { transcript: string; language: string } | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      try { ws.close(); } catch { /* ignore */ }
      resolve(result);
    };

    // 30-second hard timeout
    const timeoutId = setTimeout(() => {
      console.error("[Soniox STT] Timed out after 30s");
      done(null);
    }, 30000);

    ws.addEventListener("open", () => {
      const config: Record<string, unknown> = {
        api_key: sonioxKey,
        model: "stt-rt-v4",
        audio_format: "auto",
        enable_language_identification: true,
        enable_endpoint_detection: true,
      };

      // Only set language_hints when the user picked a specific language.
      // For auto-detect, Soniox's multilingual model handles it natively.
      if (languageCode) {
        config.language_hints = [SONIOX_LANGUAGE_HINTS[languageCode] ?? languageCode.split("-")[0]];
      }

      ws.send(JSON.stringify(config));

      // Stream audio in chunks (Soniox recommended: 3840 bytes)
      const CHUNK_SIZE = 3840;
      for (let offset = 0; offset < audioBytes.length; offset += CHUNK_SIZE) {
        ws.send(audioBytes.slice(offset, offset + CHUNK_SIZE));
      }

      // Empty string signals end-of-audio to the server
      ws.send("");
    });

    ws.addEventListener("message", (event: MessageEvent) => {
      interface SonioxToken {
        text: string;
        is_final: boolean;
        language?: string;
        translation_status?: string;
      }
      interface SonioxResponse {
        error_code?: string;
        error_message?: string;
        tokens?: SonioxToken[];
        finished?: boolean;
      }

      let res: SonioxResponse;
      try {
        res = JSON.parse(event.data as string) as SonioxResponse;
      } catch {
        return;
      }

      if (res.error_code) {
        console.error("[Soniox STT Error]", res.error_code, res.error_message);
        done(null);
        return;
      }

      for (const token of res.tokens ?? []) {
        if (token.is_final && token.text && token.translation_status !== "translation") {
          finalTokens.push(token.text);
          if (token.language && !detectedLang) {
            detectedLang = token.language;
          }
        }
      }

      if (res.finished) {
        const transcript = cleanTranscript(finalTokens.join(""));
        if (!transcript) {
          done(null);
          return;
        }
        const language =
          SONIOX_TO_LOCALE[detectedLang ?? ""] ?? (languageCode || "en-US");
        done({ transcript, language });
      }
    });

    ws.addEventListener("error", () => {
      console.error("[Soniox STT] WebSocket error");
      done(null);
    });
  });
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Subscription feature gate
    const userRole = (session.user as unknown as { role: string }).role;
    const gateErr = await enforceFeatureGate(session.user.id!, userRole, { type: "ai", feature: "ai_voice_input" });
    if (gateErr) return gateErr;

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

    const __aiQuota = await enforceDailyAiQuota(session.user.id!, userRole);
    if (__aiQuota) return __aiQuota;

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

    // ─── PRIMARY: Soniox real-time STT ───────────────────────────────────────
    // Auto-detect: no language hint → Soniox identifies language automatically.
    // Manual: pass the explicit BCP-47 language code.
    const sonioxKey = process.env.SONIOX_API_KEY;
    if (sonioxKey) {
      try {
        const result = await trySonioxTranscription(
          audioFile,
          isAutoDetect ? null : languageCode,
          sonioxKey
        );
        if (result) {
          return NextResponse.json(result, {
            headers: { "X-RateLimit-Remaining": String(remaining) },
          });
        }
      } catch (sonioxErr) {
        console.error("[Soniox STT Error]", sonioxErr);
        // Fall through to Gemini / Google
      }
    }

    const audioBuffer = await audioFile.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString("base64");

    // ─── FALLBACK 1: Gemini (auto-detect only — multilingual, code-switching) ─
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
            { transcript: cleanTranscript(transcript), language: langMap[detectedLang] ?? "auto" },
            { headers: { "X-RateLimit-Remaining": String(remaining) } }
          );
        } catch (geminiErr) {
          console.error("[Gemini Speech Error]", geminiErr);
          // Fall through to Google Speech API
        }
      }
    }

    // ─── FALLBACK 2: Google Cloud Speech-to-Text ─────────────────────────────
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
    const rawTranscript =
      speechData.results
        ?.flatMap((r: { alternatives?: Array<{ transcript?: string }> }) =>
          r.alternatives?.map((a) => a.transcript ?? "") ?? []
        )
        .join(" ")
        .trim() ?? "";

    await logActivity({
      actorId: session.user.id!,
      actorRole: userRole,
      action: "ai.speech_to_text",
      resource: "ai",
      meta: { language: speechLangCode },
      req,
    });

    return NextResponse.json(
      { transcript: cleanTranscript(rawTranscript), language: speechLangCode },
      { headers: { "X-RateLimit-Remaining": String(remaining) } }
    );
  } catch (err) {
    console.error("[Speech-to-Text Error]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
