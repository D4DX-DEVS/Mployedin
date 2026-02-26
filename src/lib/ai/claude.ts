/**
 * Claude AI client library (Anthropic)
 * Provides: generateText, generateStream, CLAUDE_MODELS, SystemPrompts
 * Falls back gracefully if ANTHROPIC_API_KEY is not set.
 */

import Anthropic from "@anthropic-ai/sdk";

export const CLAUDE_MODELS = {
  haiku: "claude-3-haiku-20240307",   // fast, cheap — good for quick tasks
  sonnet: "claude-3-5-sonnet-20241022", // balanced — recommended for most tasks
  opus: "claude-3-opus-20240229",      // most capable — complex reasoning
} as const;

export type ClaudeModel = typeof CLAUDE_MODELS[keyof typeof CLAUDE_MODELS];

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY environment variable is not set");
    }
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

interface TextGenerationOptions {
  model?: ClaudeModel;
  maxTokens?: number;
  temperature?: number;
  system?: string;
}

/**
 * Generate a single-turn text completion with Claude.
 */
export async function generateTextClaude(
  prompt: string,
  options: TextGenerationOptions = {}
): Promise<string> {
  const client = getClient();
  const {
    model = CLAUDE_MODELS.sonnet,
    maxTokens = 1024,
    temperature = 0.7,
    system,
  } = options;

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    ...(system ? { system } : {}),
    messages: [{ role: "user", content: prompt }],
  });

  const block = response.content[0];
  if (block.type !== "text") throw new Error("Unexpected content type from Claude");
  return block.text;
}

/**
 * Generate a streaming text response from Claude.
 * Returns an async generator that yields text chunks.
 */
export async function* generateStreamClaude(
  prompt: string,
  options: TextGenerationOptions = {}
): AsyncGenerator<string> {
  const client = getClient();
  const {
    model = CLAUDE_MODELS.sonnet,
    maxTokens = 1024,
    temperature = 0.7,
    system,
  } = options;

  const stream = await client.messages.stream({
    model,
    max_tokens: maxTokens,
    temperature,
    ...(system ? { system } : {}),
    messages: [{ role: "user", content: prompt }],
  });

  for await (const chunk of stream) {
    if (
      chunk.type === "content_block_delta" &&
      chunk.delta.type === "text_delta"
    ) {
      yield chunk.delta.text;
    }
  }
}

/**
 * Multi-turn chat with Claude.
 */
export interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

export async function chatClaude(
  messages: ClaudeMessage[],
  options: TextGenerationOptions = {}
): Promise<string> {
  const client = getClient();
  const {
    model = CLAUDE_MODELS.sonnet,
    maxTokens = 2048,
    temperature = 0.7,
    system,
  } = options;

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    ...(system ? { system } : {}),
    messages,
  });

  const block = response.content[0];
  if (block.type !== "text") throw new Error("Unexpected content type");
  return block.text;
}

/**
 * Parse structured JSON from Claude output.
 * Extracts JSON from ```json ... ``` or raw JSON.
 */
export function parseClaudeJson<T>(text: string): T {
  // Try extracting from code block first
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonText = codeBlockMatch ? codeBlockMatch[1].trim() : text.trim();

  // Find first { or [
  const start = jsonText.search(/[{[]/);
  if (start === -1) throw new Error("No JSON found in Claude response");

  return JSON.parse(jsonText.slice(start)) as T;
}

/**
 * Check if Claude is available (ANTHROPIC_API_KEY is set)
 */
export function isClaudeAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export const ClaudeSystemPrompts = {
  recruitment: `You are an expert AI recruitment assistant specializing in Gulf region hiring (UAE, Saudi Arabia, Qatar, Kuwait, Bahrain, Oman). You understand local labor laws, visa processes, and cultural nuances. Provide accurate, helpful advice.`,

  cvExtractor: `You are a CV/resume data extraction specialist. Extract structured information from CV text with high accuracy. Return valid JSON only.`,

  jobMatcher: `You are an expert at matching job candidates to positions. Analyze skills, experience, and requirements objectively. Provide percentage scores with clear reasoning.`,

  careerAdvisor: `You are a career advisor for Gulf region professionals. Provide practical, actionable advice on career development, skills, and job searching in the GCC market.`,

  dataAnalyst: `You are a data analyst specializing in recruitment metrics. Analyze data accurately and present insights clearly with specific numbers and trends.`,
};
