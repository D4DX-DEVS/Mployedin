import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { sanitizeChatMessages, sanitizeAIInput, AI_TOKEN_LIMITS } from "@/lib/ai/sanitize";
import { GEMINI_MODELS } from "@/lib/ai/gemini";
import { getAssistantSystemPrompt, type AssistantTab } from "@/lib/ai/assistantPrompts";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const CHAT_MODEL = GEMINI_MODELS.flash;

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limit AI calls per user
    const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown";
    const { allowed, remaining, resetAt } = checkRateLimit(
      `ai-chat:${session.user.id ?? ip}`,
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

    const body = await req.json();
    const messages = sanitizeChatMessages(body.messages ?? [], 50, 4000);
    const context = body.context ? sanitizeAIInput(String(body.context), 2000) : undefined;

    if (!messages.length) {
      return NextResponse.json({ error: "messages array required" }, { status: 400 });
    }

    const systemPrompt = getSystemPrompt(context ?? "");

    // Build OpenAI-compatible messages array
    const openRouterMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: systemPrompt },
      ...messages.map((m: { role: string; content: string }) => ({
        role: (m.role === "user" ? "user" : "assistant") as "user" | "assistant",
        content: m.content,
      })),
    ];

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      console.error("[AI Chat] OPENROUTER_API_KEY not set");
      return NextResponse.json({ error: "AI service not configured" }, { status: 503 });
    }

    const upstream = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "https://mployedin.com",
        "X-Title": "Mployedin",
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages: openRouterMessages,
        max_tokens: AI_TOKEN_LIMITS.chat,
        stream: true,
      }),
    });

    if (!upstream.ok) {
      const err = await upstream.text();
      console.error("[AI Chat] OpenRouter error:", upstream.status, err);
      return NextResponse.json({ error: "AI service error" }, { status: 502 });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const reader = upstream.body?.getReader();
        if (!reader) { controller.close(); return; }
        const decoder = new TextDecoder();
        let buffer = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const raw = line.slice(6).trim();
              if (raw === "[DONE]") { controller.close(); return; }
              try {
                const chunk = JSON.parse(raw) as {
                  choices: { delta: { content?: string } }[];
                };
                const text = chunk.choices[0]?.delta?.content;
                if (text) controller.enqueue(encoder.encode(text));
              } catch { /* skip malformed chunk */ }
            }
          }
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "X-RateLimit-Remaining": String(remaining),
      },
    });
  } catch (error) {
    console.error("[AI Chat Error]", error);
    return NextResponse.json(
      { error: "AI service error" },
      { status: 500 }
    );
  }
}

function getSystemPrompt(context: string): string {
  const base =
    "You are an AI assistant for MPLOYEDIN, an AI-powered international recruitment platform for the Gulf region. Be helpful, professional, and concise.";

  // Recruitment assistant tab contexts
  const assistantContexts: AssistantTab[] = ["job_creator", "interview_ai", "screening_ai"];
  if (assistantContexts.includes(context as AssistantTab)) {
    return getAssistantSystemPrompt(context as AssistantTab);
  }

  const contextPrompts: Record<string, string> = {
    cv_extraction:
      base + " Help users understand their extracted CV data and suggest improvements.",
    job_match:
      base + " Help users understand job matches, AI scores, and application tips.",
    interview_prep:
      base + " Help candidates prepare for interviews with role-specific tips.",
    employer_assist:
      base + " Help employers with job postings, candidate evaluation, and hiring.",
    agent_assist:
      base + " Help recruitment agents manage their pipeline, leads, and candidates.",
    general_assist: base,
  };

  return contextPrompts[context] ?? base;
}
