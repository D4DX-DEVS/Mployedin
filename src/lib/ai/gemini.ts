/**
 * Centralized Gemini AI client library
 * All Gemini API interactions go through this module.
 */

import { GoogleGenerativeAI, GenerateContentStreamResult, Part } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY ?? "";
const genAI = new GoogleGenerativeAI(apiKey);

export const GEMINI_MODELS = {
  flash: "gemini-1.5-flash",
  pro: "gemini-1.5-pro",
  flash2: "gemini-2.0-flash-exp",
} as const;

type GeminiModel = (typeof GEMINI_MODELS)[keyof typeof GEMINI_MODELS];

/** Get a Gemini model instance */
export function getGeminiModel(model: GeminiModel = GEMINI_MODELS.flash) {
  return genAI.getGenerativeModel({ model });
}

/** Generate a single text response */
export async function generateText(
  prompt: string,
  model: GeminiModel = GEMINI_MODELS.flash
): Promise<string> {
  const m = getGeminiModel(model);
  const result = await m.generateContent(prompt);
  return result.response.text();
}

/** Generate a streaming response */
export async function generateStream(
  prompt: string,
  model: GeminiModel = GEMINI_MODELS.flash
): Promise<GenerateContentStreamResult> {
  const m = getGeminiModel(model);
  return m.generateContentStream(prompt);
}

/** Start a chat session */
export function startChat(
  history: { role: "user" | "model"; parts: { text: string }[] }[] = [],
  model: GeminiModel = GEMINI_MODELS.flash
) {
  const m = getGeminiModel(model);
  return m.startChat({ history });
}

/** Generate with multimodal content (text + image/PDF) */
export async function generateMultimodal(
  parts: Part[],
  model: GeminiModel = GEMINI_MODELS.flash
): Promise<string> {
  const m = getGeminiModel(model);
  const result = await m.generateContent({ contents: [{ role: "user", parts }] });
  return result.response.text();
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
