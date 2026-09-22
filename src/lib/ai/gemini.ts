/**
 * Centralized text AI client — Google Gemini API.
 *
 * The file name and every export below are unchanged from when this pointed at
 * OpenRouter (and Muse AI, for one day), so the ~15 call sites keep compiling
 * and behaving the same. Only the provider underneath moved. Base URLs, key
 * handling, model ids and the thinking policy live in `@/lib/ai/googleAI`.
 */

import {
  GOOGLE_AI_MODELS,
  chatCompletionsFetch,
  generateContentFetch,
  sseToAsyncIterable,
  logUsage,
  nativeUsage,
  nativeResponseText,
  nativeThinkingConfig,
  providerErrorMessage,
  jsonModeRequestFields,
  JSON_INSTRUCTION,
  completionBudget,
  textReasoningEffort,
  type ChatMessage,
  type ChatUsage,
  type NativeGenerateContentResponse,
  type NativePart,
} from "@/lib/ai/googleAI";

/**
 * Aliases kept because call sites and TASK_MODEL_MAP in `@/lib/ai/router` index
 * into them by name. `cheap` used to mean Meta's contributor tier; it is now
 * simply the default text model, which is already the cheapest one Google sells.
 */
export const GEMINI_MODELS = {
  flash: GOOGLE_AI_MODELS.text,
  flashLite: GOOGLE_AI_MODELS.text,
  cheap: GOOGLE_AI_MODELS.text,
  pro: GOOGLE_AI_MODELS.smart,
  gpt: GOOGLE_AI_MODELS.smart,
} as const;

type GeminiModel = (typeof GEMINI_MODELS)[keyof typeof GEMINI_MODELS];

async function chatFetch(
  model: GeminiModel,
  messages: ChatMessage[],
  maxTokens?: number,
  stream = false,
  jsonMode = false
): Promise<Response> {
  const effort = textReasoningEffort();
  return chatCompletionsFetch(
    {
      model,
      messages: jsonMode ? [{ role: "system", content: JSON_INSTRUCTION } as ChatMessage, ...messages] : messages,
      // Callers size maxTokens for the visible answer; thinking (when enabled)
      // shares the same budget, so completionBudget adds headroom only then.
      ...(maxTokens ? { max_tokens: completionBudget(maxTokens, effort) } : {}),
      ...(jsonMode ? jsonModeRequestFields() : {}),
      reasoning_effort: effort,
      stream,
    },
    `chat:${model}`
  );
}

/** Generate a single text response */
export async function generateText(
  prompt: string,
  model: GeminiModel = GEMINI_MODELS.flash,
  maxOutputTokens?: number,
  jsonMode = false
): Promise<string> {
  const start = Date.now();
  const res = await chatFetch(model, [{ role: "user", content: prompt }], maxOutputTokens, false, jsonMode);
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(providerErrorMessage(res.status, err, "request"));
  }
  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
    usage?: ChatUsage;
  };
  logUsage(model, data.usage, start);
  return data.choices[0].message.content;
}

/** Generate a streaming response — returns an async iterable of text chunks */
export async function generateStream(
  prompt: string,
  model: GeminiModel = GEMINI_MODELS.flash
): Promise<AsyncIterable<string>> {
  const res = await chatFetch(model, [{ role: "user", content: prompt }], undefined, true);
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(providerErrorMessage(res.status, err, "stream"));
  }
  return sseToAsyncIterable(res);
}

/**
 * Generate with multimodal content (text + image/PDF).
 *
 * Goes through the native generateContent API rather than the OpenAI-compatible
 * one: the compat layer takes images but not PDFs, and CV / job-poster
 * extraction sends PDFs.
 */
export async function generateMultimodal(
  parts: NativePart[],
  model: GeminiModel = GEMINI_MODELS.flash,
  maxOutputTokens?: number
): Promise<string> {
  const start = Date.now();
  const effort = textReasoningEffort();
  const res = await generateContentFetch(
    model,
    {
      contents: [{ role: "user", parts }],
      generationConfig: {
        ...(maxOutputTokens ? { maxOutputTokens: completionBudget(maxOutputTokens, effort) } : {}),
        ...nativeThinkingConfig(model, effort),
      },
    },
    `multimodal:${model}`
  );
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    // Native generateContent — always Google, whatever serves plain text.
    throw new Error(providerErrorMessage(res.status, err, "request", "google"));
  }
  const data = (await res.json()) as NativeGenerateContentResponse;
  logUsage(model, nativeUsage(data), start);
  const text = nativeResponseText(data);
  if (!text) {
    const why = data.promptFeedback?.blockReason ?? data.candidates?.[0]?.finishReason ?? "empty response";
    throw new Error(`Gemini returned no text (${why})`);
  }
  return text;
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
