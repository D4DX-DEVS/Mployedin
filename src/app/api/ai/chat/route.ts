import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { sanitizeChatMessages, sanitizeAIInput, AI_TOKEN_LIMITS } from "@/lib/ai/sanitize";
import { GEMINI_MODELS } from "@/lib/ai/gemini";
import { getAssistantSystemPrompt, type AssistantTab } from "@/lib/ai/assistantPrompts";
import { connectDB } from "@/lib/db/mongoose";
import JobSeeker from "@/models/JobSeeker";
import Job from "@/models/Job";
import User from "@/models/User";
import type { UserRole } from "@/types/user";

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

    // Fetch user profile + real platform jobs for context-aware AI responses
    const userRole = (session.user as unknown as { role: UserRole }).role;
    let profileContext = "";
    let jobsContext = "";

    if (userRole === "job_seeker") {
      try {
        await connectDB();
        const [user, profile] = await Promise.all([
          User.findById(session.user.id).select("name email").lean(),
          JobSeeker.findOne({ userId: session.user.id })
            .select("skills experience education languages certifications headline workStatus totalExperienceYears totalExperienceMonths currentLocation preferredCountries preferredRoles preferredSalary preferredJobType availabilityStatus industry nationality")
            .lean(),
        ]);

        if (profile) {
          const parts: string[] = [];
          if (user?.name) parts.push(`Name: ${user.name}`);
          if (profile.headline) parts.push(`Headline: ${profile.headline}`);
          if (profile.skills?.length) parts.push(`Skills: ${profile.skills.join(", ")}`);
          if (profile.totalExperienceYears || profile.totalExperienceMonths) {
            const yrs = profile.totalExperienceYears ?? 0;
            const mos = profile.totalExperienceMonths ?? 0;
            parts.push(`Experience: ${yrs} year(s)${mos ? ` ${mos} month(s)` : ""}`);
          }
          if (profile.workStatus) parts.push(`Work status: ${profile.workStatus}`);
          if (profile.currentLocation) parts.push(`Current location: ${profile.currentLocation}`);
          if (profile.nationality) parts.push(`Nationality: ${profile.nationality}`);
          if (profile.industry) parts.push(`Industry: ${profile.industry}`);
          if (profile.preferredRoles?.length) parts.push(`Preferred roles: ${profile.preferredRoles.join(", ")}`);
          if (profile.preferredCountries?.length) parts.push(`Preferred countries: ${profile.preferredCountries.join(", ")}`);
          if (profile.preferredJobType) parts.push(`Preferred job type: ${profile.preferredJobType}`);
          if (profile.preferredSalary) {
            const sal = profile.preferredSalary;
            parts.push(`Preferred salary: ${sal.min ?? "?"}-${sal.max ?? "?"} ${sal.currency ?? "USD"}`);
          }
          if (profile.availabilityStatus) parts.push(`Availability: ${profile.availabilityStatus.replace(/_/g, " ")}`);
          if (profile.education?.length) {
            const eduStr = profile.education.map((e: { degree: string; institution: string; field?: string }) =>
              `${e.degree}${e.field ? ` in ${e.field}` : ""} from ${e.institution}`
            ).join("; ");
            parts.push(`Education: ${eduStr}`);
          }
          if (profile.experience?.length) {
            const expStr = profile.experience.slice(0, 3).map((e: { jobTitle: string; company: string; isCurrent: boolean }) =>
              `${e.jobTitle} at ${e.company}${e.isCurrent ? " (current)" : ""}`
            ).join("; ");
            parts.push(`Recent roles: ${expStr}`);
          }
          if (profile.languages?.length) {
            const langStr = profile.languages.map((l: { language: string; proficiency: string }) =>
              `${l.language} (${l.proficiency})`
            ).join(", ");
            parts.push(`Languages: ${langStr}`);
          }
          if (profile.certifications?.length) parts.push(`Certifications: ${profile.certifications.join(", ")}`);

          if (parts.length > 0) {
            profileContext = `\n\n## User Profile (use this to personalize responses — do NOT ask for info already available here)\n${parts.join("\n")}`;
          }

          // Fetch real active jobs from MPLOYEDIN database matching user's skills
          const userSkills: string[] = profile.skills ?? [];
          const skillFilter = userSkills.length > 0
            ? { "requirements.skills": { $in: userSkills } }
            : {};

          const liveJobs = await Job.find({
            status: "active",
            ...skillFilter,
          })
            .select("_id title category location requirements salary tags description")
            .sort({ createdAt: -1 })
            .limit(10)
            .lean();

          if (liveJobs.length > 0) {
            const jobLines = liveJobs.map((j) => {
              const loc = j.location.isRemote
                ? "Remote"
                : `${j.location.city}, ${j.location.country}`;
              const sal = j.salary?.min && j.salary?.max
                ? ` | ${j.salary.currency} ${j.salary.min.toLocaleString()}–${j.salary.max.toLocaleString()} ${j.salary.period ?? ""}`
                : j.salary?.isNegotiable ? " | Salary negotiable" : "";
              const skills = j.requirements?.skills?.slice(0, 5).join(", ") ?? "";
              const link = `/en/job-seeker/jobs/${j._id}`;
              return `- [${j.title}](${link}) | ${loc}${sal} | Skills: ${skills}`;
            });
            jobsContext = `\n\n## Live Jobs on MPLOYEDIN (ONLY reference these — never invent jobs)\n${jobLines.join("\n")}\n\nFormat EVERY job recommendation as a markdown link exactly like: [Job Title](URL). Never show raw IDs. Always use the link format from the list above so users can click to view the job. Tell the user they can click the job title to view and apply. Do NOT mention any job not in this list.`;
          } else {
            jobsContext = `\n\n## Live Jobs on MPLOYEDIN\nNo active jobs currently match the user's skill set. Tell the user honestly that there are no matching roles right now and suggest they check their job feed for the latest listings or update their skills.`;
          }
        }
      } catch (err) {
        console.error("[AI Chat] Failed to fetch user profile:", err);
        // Continue without profile — graceful degradation
      }
    }

    const systemPrompt = getSystemPrompt(context ?? "", profileContext, jobsContext);

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

function getSystemPrompt(context: string, profileContext: string, jobsContext: string): string {
  const base =
    "You are an AI assistant for MPLOYEDIN, an AI-powered international recruitment platform for the Gulf region. Be helpful, professional, and concise.";

  // Recruitment assistant tab contexts (employer-only — no profile injection)
  const assistantContexts: AssistantTab[] = ["job_creator", "interview_ai", "screening_ai"];
  if (assistantContexts.includes(context as AssistantTab)) {
    return getAssistantSystemPrompt(context as AssistantTab);
  }

  const jobRule = `\n\nCRITICAL RULE: NEVER invent, guess, or fabricate job listings. Only recommend real jobs from the "Live Jobs on MPLOYEDIN" section if provided. If no jobs section is provided or it is empty, tell the user to check their job feed.`;

  const profileAwareBase = profileContext
    ? `${base}${jobRule}

IMPORTANT: The user's profile is provided below. Use it to give personalized responses.
- When the user asks for job suggestions, ONLY recommend jobs from the "Live Jobs on MPLOYEDIN" list below.
- Do NOT ask for information that is already in their profile.
- If profile data is incomplete for a specific question, ask only for the missing piece.
- Reference their profile naturally (e.g., "Based on your React and Node.js experience…").${profileContext}${jobsContext}`
    : base + jobRule;

  const contextPrompts: Record<string, string> = {
    cv_extraction:
      profileAwareBase + "\n\nHelp users understand their extracted CV data and suggest improvements.",
    job_match:
      profileAwareBase + "\n\nHelp users understand job matches, AI scores, and application tips.",
    interview_prep:
      profileAwareBase + "\n\nHelp candidates prepare for interviews with role-specific tips based on their profile and target roles.",
    employer_assist:
      base + " Help employers with job postings, candidate evaluation, and hiring.",
    agent_assist:
      base + " Help recruitment agents manage their pipeline, leads, and candidates.",
    general_assist: profileAwareBase,
  };

  return contextPrompts[context] ?? profileAwareBase;
}
