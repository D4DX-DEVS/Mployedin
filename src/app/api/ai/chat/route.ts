import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

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

    const { messages, context } = await req.json();

    const systemPrompt = getSystemPrompt(context);

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Build conversation history
    const history = messages.slice(0, -1).map(
      (m: { role: string; content: string }) => ({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.content }],
      })
    );

    const chat = model.startChat({
      history,
      systemInstruction: systemPrompt,
    });

    const lastMessage = messages[messages.length - 1];

    // Stream the response
    const result = await chat.sendMessageStream(lastMessage.content);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        for await (const chunk of result.stream) {
          const text = chunk.text();
          controller.enqueue(encoder.encode(text));
        }
        controller.close();
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
