import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { enforceFeatureGate } from "@/lib/subscription/featureGate";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { enforceDailyAiQuota } from "@/lib/ai/dailyQuota";
import { sanitizeChatMessages, sanitizeAIInput, AI_TOKEN_LIMITS } from "@/lib/ai/sanitize";
import { SMALL_MODEL, LARGE_MODEL, classifyComplexity } from "@/lib/ai/copilot/modelRouter";
import { getCopilotSystemPrompt } from "@/lib/ai/copilot/prompts";
import { getToolsForUser, getToolByName } from "@/lib/ai/copilot/registry";
import { toJsonSchema, validateArgs } from "@/lib/ai/copilot/paramSchema";
import type { CopilotStreamFrame, CopilotToolContext, CopilotToolPreview } from "@/lib/ai/copilot/types";
import { parseEmployerJobIdFromPath, buildEmployerJobContext } from "@/lib/ai/copilot/pageContext";
import { prepareHistoryForModel } from "@/lib/ai/copilot/historyToolData";
import { connectDB } from "@/lib/db/mongoose";
import { validateBody } from "@/lib/validators";
import { copilotChatSchema } from "@/lib/validators/ai";
import CopilotProposal from "@/models/CopilotProposal";
import { logActivity } from "@/lib/audit/log";
import type { UserRole, PermissionMode, CustomPermissions } from "@/types/user";
import logger from "@/lib/logger";

import {
  GOOGLE_AI_OPENAI_BASE,
  hasGoogleAiApiKey,
  getGoogleAiApiKey,
  openAiCompatHeaders,
  providerErrorMessage,
  completionBudget,
  copilotReasoningEffort,
} from "@/lib/ai/googleAI";

const MAX_TOOL_ITERATIONS = 4;
const PROPOSAL_TTL_MS = 15 * 60 * 1000;

interface CopilotToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
  /**
   * Gemini 3.x attaches `{ google: { thought_signature } }` to every tool call
   * and rejects the follow-up request (400 "Function call is missing a
   * thought_signature") unless the assistant message that carries the tool
   * call echoes it back verbatim. Opaque to us; never read, only forwarded.
   */
  extra_content?: Record<string, unknown>;
}
interface CopilotMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: CopilotToolCall[];
  tool_call_id?: string;
  name?: string;
}

interface CopilotDelta {
  content?: string;
  tool_calls?: Array<{
    index?: number;
    id?: string;
    function?: { name?: string; arguments?: string };
    extra_content?: Record<string, unknown>;
  }>;
}

async function callGeminiOnce(
  model: string,
  messages: CopilotMessage[],
  tools: unknown[],
  apiKey: string,
  onDelta?: (chunk: string) => void
): Promise<CopilotMessage> {
  const res = await fetch(`${GOOGLE_AI_OPENAI_BASE}/chat/completions`, {
    method: "POST",
    headers: openAiCompatHeaders(apiKey),
    body: JSON.stringify({
      model,
      messages,
      // Thinking (when enabled via env) shares max_tokens with the answer, so
      // completionBudget adds headroom only in that case.
      max_tokens: completionBudget(AI_TOKEN_LIMITS.chat, copilotReasoningEffort()),
      reasoning_effort: copilotReasoningEffort(),
      stream: true,
      ...(tools.length ? { tools, tool_choice: "auto" } : {}),
    }),
  });
  if (!res.ok || !res.body) {
    const err = await res.text().catch(() => "");
    throw new Error(providerErrorMessage(res.status, err));
  }

  // Assemble the full assistant message from SSE deltas, forwarding text
  // chunks to onDelta as they arrive so the client can render progressively.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  const toolCalls: CopilotToolCall[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const payload = line.trim();
      if (!payload.startsWith("data:")) continue;
      const data = payload.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      let json: { choices?: { delta?: CopilotDelta }[] };
      try {
        json = JSON.parse(data);
      } catch {
        continue;
      }
      const delta = json.choices?.[0]?.delta;
      if (!delta) continue;
      if (delta.content) {
        content += delta.content;
        onDelta?.(delta.content);
      }
      for (const tc of delta.tool_calls ?? []) {
        const i = tc.index ?? 0;
        if (!toolCalls[i]) toolCalls[i] = { id: "", type: "function", function: { name: "", arguments: "" } };
        if (tc.id) toolCalls[i].id = tc.id;
        if (tc.function?.name) toolCalls[i].function.name += tc.function.name;
        if (tc.function?.arguments) toolCalls[i].function.arguments += tc.function.arguments;
        if (tc.extra_content) toolCalls[i].extra_content = tc.extra_content;
      }
    }
  }

  const filtered = toolCalls.filter(Boolean);
  return { role: "assistant", content: content || null, ...(filtered.length ? { tool_calls: filtered } : {}) };
}

/**
 * Calls the given model; on failure (free/small models can be rate-limited or
 * briefly unavailable) transparently retries once on LARGE_MODEL so a flaky
 * cheap tier degrades to "costs more this turn" instead of a broken reply.
 */
async function callGemini(model: string, messages: CopilotMessage[], tools: unknown[], apiKey: string, onDelta?: (chunk: string) => void) {
  try {
    return { message: await callGeminiOnce(model, messages, tools, apiKey, onDelta), modelUsed: model };
  } catch (err) {
    if (model === LARGE_MODEL) throw err;
    logger.warn({ err, model }, "[AI Copilot] small model failed, falling back to large model");
    // ponytail: a mid-stream failure may have emitted partial deltas before the retry
    // re-streams — the final "text" frame replaces the client's buffer, so it self-heals.
    return { message: await callGeminiOnce(LARGE_MODEL, messages, tools, apiKey, onDelta), modelUsed: LARGE_MODEL };
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id!;
    const role = (session.user as unknown as { role: UserRole }).role;
    const locale = (session.user as unknown as { locale: string }).locale ?? "en";
    const permissionMode = ((session.user as unknown as { permissionMode?: PermissionMode }).permissionMode) ?? "role_default";
    const customPermissions = (session.user as unknown as { customPermissions?: CustomPermissions }).customPermissions;

    const gateErr = await enforceFeatureGate(userId, role, { type: "ai", feature: "ai_chat" });
    if (gateErr) return gateErr;

    const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown";
    const { allowed, resetAt } = await checkRateLimit(`ai-copilot:${userId ?? ip}`, RATE_LIMIT_CONFIGS.ai);
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil((resetAt - Date.now()) / 1000)) } }
      );
    }

    const quotaErr = await enforceDailyAiQuota(userId, role);
    if (quotaErr) return quotaErr;

    const body = await validateBody(req, copilotChatSchema);
    const messages = sanitizeChatMessages(body.messages ?? [], 30, 4000);
    const currentPage = body.currentPage ? sanitizeAIInput(String(body.currentPage), 200) : undefined;
    if (!messages.length) {
      return NextResponse.json({ error: "messages array required" }, { status: 400 });
    }

    const apiKey = hasGoogleAiApiKey() ? getGoogleAiApiKey() : "";
    if (!apiKey) {
      logger.error("[AI Copilot] GEMINI_API_KEY not set");
      return NextResponse.json({ error: "AI service not configured" }, { status: 503 });
    }

    await connectDB();
    const tools = getToolsForUser(role, permissionMode, customPermissions);
    const chatTools = tools.map((t) => ({
      type: "function" as const,
      function: { name: t.name, description: t.description, parameters: toJsonSchema(t.parameters) },
    }));

    let systemPrompt = getCopilotSystemPrompt(role);
    if (currentPage) systemPrompt += `\n\n## Current Page\nThe user is currently viewing: ${currentPage}`;

    let pageJobId: string | undefined;
    if (role === "employer" && currentPage) {
      const parsedJobId = parseEmployerJobIdFromPath(currentPage);
      if (parsedJobId) {
        try {
          const jobContext = await buildEmployerJobContext(userId, parsedJobId);
          if (jobContext) {
            pageJobId = jobContext.jobId;
            systemPrompt += `\n\n## Current Job\nThe user is looking at their own job "${jobContext.title}" (jobId: ${jobContext.jobId}) — ${jobContext.applicants} applicants, ${jobContext.atApplied} still at the Applied stage. When they say "this job", "these candidates" or give no job, use this jobId without asking.`;
          }
        } catch (err) {
          logger.warn({ err, userId, parsedJobId }, "[AI Copilot] failed to build job context");
        }
      }
    }

    const chatMessages: CopilotMessage[] = [
      { role: "system", content: systemPrompt },
      ...prepareHistoryForModel(messages),
    ];

    const toolCtx: CopilotToolContext = { userId, role, locale, permissionMode, customPermissions, req, currentPage, pageJobId };

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (frame: CopilotStreamFrame) => controller.enqueue(encoder.encode(JSON.stringify(frame) + "\n"));

        try {
          let toolCallsLogged = 0;
          let currentModel = classifyComplexity(messages) === "large" ? LARGE_MODEL : SMALL_MODEL;
          const modelsUsed = new Set<string>();
          let answered = false;

          const onDelta = (chunk: string) => send({ type: "text_delta", content: chunk });

          for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
            const { message, modelUsed } = await callGemini(currentModel, chatMessages, chatTools, apiKey, onDelta);
            currentModel = modelUsed; // stick with whatever actually served this call
            modelsUsed.add(modelUsed);

            if (message.tool_calls?.length) {
              chatMessages.push({ role: "assistant", content: message.content ?? null, tool_calls: message.tool_calls });

              for (const call of message.tool_calls) {
                const tool = getToolByName(call.function.name);
                const isPermitted = tool && tools.some((t) => t.name === tool.name);

                if (!isPermitted) {
                  chatMessages.push({
                    role: "tool",
                    tool_call_id: call.id,
                    name: call.function.name,
                    content: JSON.stringify({ ok: false, message: "You are not permitted to use this tool." }),
                  });
                  continue;
                }

                let rawArgs: unknown = {};
                try {
                  rawArgs = call.function.arguments ? JSON.parse(call.function.arguments) : {};
                } catch {
                  chatMessages.push({
                    role: "tool",
                    tool_call_id: call.id,
                    name: call.function.name,
                    content: JSON.stringify({ ok: false, message: "Malformed tool arguments." }),
                  });
                  continue;
                }

                const validated = validateArgs(tool.parameters, rawArgs);
                if (!validated.ok) {
                  chatMessages.push({
                    role: "tool",
                    tool_call_id: call.id,
                    name: call.function.name,
                    content: JSON.stringify({ ok: false, message: validated.error }),
                  });
                  continue;
                }

                send({ type: "tool_call", tool: tool.name, label: tool.summarize(validated.value) });

                if (tool.mutates) {
                  // A write is being proposed — escalate to the strong model for the
                  // rest of this turn. Getting a mutation's args or follow-up wrong
                  // costs more than the model-tier savings are worth.
                  currentModel = LARGE_MODEL;
                  let preview: CopilotToolPreview | undefined;
                  if (tool.preview) {
                    try {
                      preview = await tool.preview(validated.value, toolCtx);
                    } catch (err) {
                      logger.warn({ err, tool: tool.name }, "[AI Copilot] preview failed");
                    }
                  }
                  if (preview?.blocker) {
                    // The dry run found nothing to do (ambiguous job, nothing to
                    // move): no card — hand the reason back so the model asks.
                    send({ type: "tool_result", tool: tool.name, ok: false, message: preview.blocker });
                    chatMessages.push({
                      role: "tool",
                      tool_call_id: call.id,
                      name: call.function.name,
                      content: JSON.stringify({ ok: false, message: preview.blocker }),
                    });
                    continue;
                  }
                  // Pin whatever the dry run resolved (e.g. the job taken from the
                  // current page) so confirming replays exactly what the card shows.
                  const proposalArgs = preview?.resolvedArgs ? { ...validated.value, ...preview.resolvedArgs } : validated.value;
                  const summary = tool.summarize(proposalArgs);
                  const proposal = await CopilotProposal.create({
                    userId,
                    role,
                    toolName: tool.name,
                    args: proposalArgs,
                    summary,
                    status: "pending",
                    expiresAt: new Date(Date.now() + PROPOSAL_TTL_MS),
                  });
                  send({
                    type: "proposal",
                    proposalId: String(proposal._id),
                    tool: tool.name,
                    label: summary,
                    summary,
                    args: proposalArgs,
                    preview: preview ? { summary: preview.summary, rows: preview.rows } : undefined,
                  });
                  chatMessages.push({
                    role: "tool",
                    tool_call_id: call.id,
                    name: call.function.name,
                    content: JSON.stringify({
                      status: "awaiting_user_confirmation",
                      ...(preview ? { preview: preview.summary, candidates: preview.rows?.slice(0, 10) } : {}),
                      note: "This action requires the user to confirm in the UI before it runs. Do not tell the user it is done — tell them a confirmation card is shown.",
                    }),
                  });
                } else {
                  const result = await tool.execute(validated.value, toolCtx);
                  send({ type: "tool_result", tool: tool.name, ok: result.ok, message: result.message, data: result.data });
                  chatMessages.push({
                    role: "tool",
                    tool_call_id: call.id,
                    name: call.function.name,
                    content: JSON.stringify(result),
                  });
                  logActivity({
                    actorId: userId,
                    actorRole: role,
                    action: `copilot.${tool.name}`,
                    resource: tool.resource,
                    meta: { args: validated.value, ok: result.ok },
                    req,
                  }).catch(() => {});
                  toolCallsLogged++;
                }
              }
              continue; // loop back so the model can respond given the tool results
            }

            // No tool calls — this is the final natural-language reply.
            send({ type: "text", content: message.content ?? "" });
            answered = true;
            break;
          }

          if (!answered) {
            // Model was still calling tools when the iteration cap hit — force a
            // final answer by calling once with no tools, so the user never gets
            // a turn that ends in silence.
            const { message } = await callGemini(currentModel, chatMessages, [], apiKey, onDelta);
            send({ type: "text", content: message.content ?? "" });
          }

          logActivity({
            actorId: userId,
            actorRole: role,
            action: "ai.copilot_request",
            resource: "ai_assistant",
            meta: { messageCount: messages.length, currentPage, toolCalls: toolCallsLogged, modelsUsed: [...modelsUsed] },
            req,
          }).catch(() => {});

          send({ type: "done" });
        } catch (err) {
          logger.error({ err }, "[AI Copilot] stream error");
          send({ type: "error", message: "AI service error" });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Transfer-Encoding": "chunked" },
    });
  } catch (error) {
    if (error instanceof NextResponse) return error;
    logger.error({ error }, "[AI Copilot Error]");
    return NextResponse.json({ error: "AI service error" }, { status: 500 });
  }
}
