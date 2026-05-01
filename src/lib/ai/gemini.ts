/**
 * Centralized Gemini AI client library — routed via OpenRouter
 * All Gemini API interactions go through this module.
 */

import logger from "@/lib/logger";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

function getApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY environment variable is not set");
  return key;
}

export const GEMINI_MODELS = {
  flash: "google/gemini-3.1-flash-lite-preview",
  pro: "google/gemini-2.5-pro",
  flashLite: "google/gemini-2.5-flash",
} as const;

type GeminiModel = (typeof GEMINI_MODELS)[keyof typeof GEMINI_MODELS];

interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string | OpenRouterContentPart[];
}

interface OpenRouterContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}

interface OpenRouterUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

async function openRouterFetch(
  model: GeminiModel,
  messages: OpenRouterMessage[],
  maxTokens?: number,
  stream = false,
  jsonMode = false
): Promise<Response> {
  return fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "https://mployedin.com",
      "X-Title": "Mployedin",
    },
    body: JSON.stringify({
      model,
      messages,
      ...(maxTokens ? { max_tokens: maxTokens } : {}),
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
      stream,
    }),
  });
}

/** Generate a single text response */
export async function generateText(
  prompt: string,
  model: GeminiModel = GEMINI_MODELS.flash,
  maxOutputTokens?: number,
  jsonMode = false
): Promise<string> {
  const start = Date.now();
  const res = await openRouterFetch(model, [{ role: "user", content: prompt }], maxOutputTokens, false, jsonMode);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${err}`);
  }
  const data = await res.json() as {
    choices: { message: { content: string } }[];
    usage?: OpenRouterUsage;
  };
  const usage = data.usage;
  if (usage) {
    logger.info(
      { model, promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens, totalTokens: usage.total_tokens, latencyMs: Date.now() - start },
      "AI usage"
    );
  }
  return data.choices[0].message.content;
}

/** Generate a streaming response — returns an async iterable of text chunks */
export async function generateStream(
  prompt: string,
  model: GeminiModel = GEMINI_MODELS.flash
): Promise<AsyncIterable<string>> {
  const res = await openRouterFetch(model, [{ role: "user", content: prompt }], undefined, true);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter stream error ${res.status}: ${err}`);
  }
  return sseToAsyncIterable(res);
}

/** Generate with multimodal content (text + image/PDF) */
export async function generateMultimodal(
  parts: { text?: string; inlineData?: { mimeType: string; data: string } }[],
  model: GeminiModel = GEMINI_MODELS.flash,
  maxOutputTokens?: number
): Promise<string> {
  const start = Date.now();
  const content: OpenRouterContentPart[] = parts.map((p) => {
    if (p.inlineData) {
      return {
        type: "image_url",
        image_url: { url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}` },
      };
    }
    return { type: "text", text: p.text ?? "" };
  });
  const res = await openRouterFetch(model, [{ role: "user", content }], maxOutputTokens);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${err}`);
  }
  const data = await res.json() as {
    choices: { message: { content: string } }[];
    usage?: OpenRouterUsage;
  };
  const usage = data.usage;
  if (usage) {
    logger.info(
      { model, promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens, totalTokens: usage.total_tokens, latencyMs: Date.now() - start },
      "AI usage"
    );
  }
  return data.choices[0].message.content;
}

/** Parse SSE stream from OpenRouter into an async iterable of text chunks */
async function* sseToAsyncIterable(res: Response): AsyncIterable<string> {
  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (raw === "[DONE]") return;
      try {
        const chunk = JSON.parse(raw) as {
          choices: { delta: { content?: string } }[];
        };
        const text = chunk.choices[0]?.delta?.content;
        if (text) yield text;
      } catch {
        // malformed chunk — skip
      }
    }
  }
}

/** Parse JSON from AI response (strips markdown code blocks) */
export function parseAIJson<T>(text: string): T {
  const cleaned = text.replace(/```json\n?|```\n?/g, "").trim();
  return JSON.parse(cleaned) as T;
}

/** Standard system prompts */
export const SystemPrompts = {
  recruitment: `You are an expert AI recruitment assistant specializing in the Gulf Cooperation Council (GCC) job market including UAE, Saudi Arabia, Qatar, Kuwait, Bahrain, and Oman. You have deep knowledge of local labor laws, visa processes, and industry trends. Always be professional, concise, and helpful.`,

  cvExtractor: `You are a CV/resume data extraction specialist. Extract structured information from CVs accurately, handling multiple formats and languages including Arabic and English. Return only valid JSON.`,

  jobMatcher: `You are a recruitment matching AI. Evaluate candidate-job fit objectively based on skills, experience, and requirements. Provide fair and detailed scoring breakdowns.`,

  careerAdvisor: `You are a career development advisor specialized in the Gulf region job market. Help candidates improve their profiles, identify skill gaps, and find the best opportunities.`,
};
