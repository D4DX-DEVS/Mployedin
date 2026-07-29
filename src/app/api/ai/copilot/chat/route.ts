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
import type { CopilotStreamFrame, CopilotToolContext } from "@/lib/ai/copilot/types";
import { connectDB } from "@/lib/db/mongoose";
import { validateBody } from "@/lib/validators";
import { copilotChatSchema } from "@/lib/validators/ai";
import CopilotProposal from "@/models/CopilotProposal";
import { logActivity } from "@/lib/audit/log";
import type { UserRole, PermissionMode, CustomPermissions } from "@/types/user";
import logger from "@/lib/logger";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const MAX_TOOL_ITERATIONS = 4;
const PROPOSAL_TTL_MS = 15 * 60 * 1000;

interface ORToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}
interface ORMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ORToolCall[];
  tool_call_id?: string;
  name?: string;
}

async function callOpenRouterOnce(model: string, messages: ORMessage[], tools: unknown[], apiKey: string) {
  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "https://mployedin.com",
      "X-Title": "Mployedin Copilot",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: AI_TOKEN_LIMITS.chat,
      ...(tools.length ? { tools, tool_choice: "auto" } : {}),
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${err}`);
  }
  const data = (await res.json()) as { choices: { message: ORMessage }[] };
  return data.choices[0].message;
}

/**
 * Calls the given model; on failure (free/small models can be rate-limited or
 * briefly unavailable) transparently retries once on LARGE_MODEL so a flaky
 * cheap tier degrades to "costs more this turn" instead of a broken reply.
 */
async function callOpenRouter(model: string, messages: ORMessage[], tools: unknown[], apiKey: string) {
  try {
    return { message: await callOpenRouterOnce(model, messages, tools, apiKey), modelUsed: model };
  } catch (err) {
    if (model === LARGE_MODEL) throw err;
    logger.warn({ err, model }, "[AI Copilot] small model failed, falling back to large model");
    return { message: await callOpenRouterOnce(LARGE_MODEL, messages, tools, apiKey), modelUsed: LARGE_MODEL };
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

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      logger.error("[AI Copilot] OPENROUTER_API_KEY not set");
      return NextResponse.json({ error: "AI service not configured" }, { status: 503 });
    }

    await connectDB();
    const tools = getToolsForUser(role, permissionMode, customPermissions);
    const orTools = tools.map((t) => ({
      type: "function" as const,
      function: { name: t.name, description: t.description, parameters: toJsonSchema(t.parameters) },
    }));

    let systemPrompt = getCopilotSystemPrompt(role);
    if (currentPage) systemPrompt += `\n\n## Current Page\nThe user is currently viewing: ${currentPage}`;

    const orMessages: ORMessage[] = [
      { role: "system", content: systemPrompt },
      ...messages.map((m: { role: string; content: string }) => ({
        role: (m.role === "user" ? "user" : "assistant") as "user" | "assistant",
        content: m.content,
      })),
    ];

    const toolCtx: CopilotToolContext = { userId, role, locale, permissionMode, customPermissions, req };

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (frame: CopilotStreamFrame) => controller.enqueue(encoder.encode(JSON.stringify(frame) + "\n"));

        try {
          let toolCallsLogged = 0;
          let currentModel = classifyComplexity(messages) === "large" ? LARGE_MODEL : SMALL_MODEL;
          const modelsUsed = new Set<string>();

          for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
            const { message, modelUsed } = await callOpenRouter(currentModel, orMessages, orTools, apiKey);
            currentModel = modelUsed; // stick with whatever actually served this call
            modelsUsed.add(modelUsed);

            if (message.tool_calls?.length) {
              orMessages.push({ role: "assistant", content: message.content ?? null, tool_calls: message.tool_calls });

              for (const call of message.tool_calls) {
                const tool = getToolByName(call.function.name);
                const isPermitted = tool && tools.some((t) => t.name === tool.name);

                if (!isPermitted) {
                  orMessages.push({
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
                  orMessages.push({
                    role: "tool",
                    tool_call_id: call.id,
                    name: call.function.name,
                    content: JSON.stringify({ ok: false, message: "Malformed tool arguments." }),
                  });
                  continue;
                }

                const validated = validateArgs(tool.parameters, rawArgs);
                if (!validated.ok) {
                  orMessages.push({
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
                  const proposal = await CopilotProposal.create({
                    userId,
                    role,
                    toolName: tool.name,
                    args: validated.value,
                    summary: tool.summarize(validated.value),
                    status: "pending",
                    expiresAt: new Date(Date.now() + PROPOSAL_TTL_MS),
                  });
                  send({
                    type: "proposal",
                    proposalId: String(proposal._id),
                    tool: tool.name,
                    label: tool.summarize(validated.value),
                    summary: tool.summarize(validated.value),
                    args: validated.value,
                  });
                  orMessages.push({
                    role: "tool",
                    tool_call_id: call.id,
                    name: call.function.name,
                    content: JSON.stringify({
                      status: "awaiting_user_confirmation",
                      note: "This action requires the user to confirm in the UI before it runs. Do not tell the user it is done — tell them a confirmation card is shown.",
                    }),
                  });
                } else {
                  const result = await tool.execute(validated.value, toolCtx);
                  send({ type: "tool_result", tool: tool.name, ok: result.ok, message: result.message, data: result.data });
                  orMessages.push({
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
            break;
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
