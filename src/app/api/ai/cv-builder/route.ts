import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/withAuth";
import { generateText, GEMINI_MODELS } from "@/lib/ai/gemini";
import { checkRateLimitDual, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { sanitizeAIInput } from "@/lib/ai/sanitize";
import logger from "@/lib/logger";

/**
 * POST /api/ai/cv-builder
 *
 * The writing help behind onboarding's "Build my CV" for seekers without one.
 * Nothing is saved here — the seeker sees, edits and keeps what comes back.
 *
 *   describe → their own words about a job / project turned into CV lines
 *   skills   → skills that fit the role and what they described
 *   summary  → a short profile summary from everything they entered
 *   extract  → everything they wrote about themselves in one box, sorted into
 *              the builder's fields for them to check step by step
 */
const line = (max: number) => z.string().max(max).optional().default("");

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("extract"),
    text: z.string().min(20).max(6000),
    fresher: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("describe"),
    kind: z.enum(["job", "project"]),
    title: z.string().min(1).max(120),
    organisation: line(120),
    targetRole: line(120),
    text: line(1500),
  }),
  z.object({
    action: z.literal("skills"),
    targetRole: line(120),
    titles: z.array(z.string().max(120)).max(10).optional().default([]),
    text: line(3000),
    have: z.array(z.string().max(60)).max(40).optional().default([]),
  }),
  z.object({
    action: z.literal("summary"),
    targetRole: line(120),
    fresher: z.boolean().optional().default(false),
    titles: z.array(z.string().max(160)).max(10).optional().default([]),
    skills: z.array(z.string().max(60)).max(30).optional().default([]),
    education: line(200),
    years: line(10),
  }),
]);

const clean = (s: string) => sanitizeAIInput(s);

/* What "extract" returns, coerced: a model that drifts from the shape loses
   that field, not the whole answer. */
const txt = (max: number) => z.string().max(max * 4).catch("").transform((v) => v.trim().slice(0, max));
const ym = z.string().catch("").transform((v) => (/^\d{4}-\d{2}$/.test(v.trim()) ? v.trim() : /^\d{4}$/.test(v.trim()) ? `${v.trim()}-01` : ""));
const yr = z.union([z.string(), z.number()]).catch("").transform((v) => { const m = /\d{4}/.exec(String(v)); return m ? m[0] : ""; });
const entry = z.object({
  title: txt(120), organisation: txt(120), start: ym, end: ym,
  current: z.boolean().catch(false), description: txt(1500),
});
const LEVELS = ["doctorate", "masters", "graduation", "diploma", "12th", "10th", "below_10th"] as const;
const extracted = z.object({
  targetRole: txt(120),
  summary: txt(1000),
  jobs: z.array(entry.catch({ title: "", organisation: "", start: "", end: "", current: false, description: "" })).max(10).catch([]),
  projects: z.array(entry.catch({ title: "", organisation: "", start: "", end: "", current: false, description: "" })).max(10).catch([]),
  education: z.array(z.object({
    level: z.union([z.enum(LEVELS), z.literal("")]).catch(""),
    course: txt(120), field: txt(120), institution: txt(160),
    startYear: yr, endYear: yr, studying: z.boolean().catch(false), grade: txt(40),
  }).catch({ level: "", course: "", field: "", institution: "", startYear: "", endYear: "", studying: false, grade: "" })).max(8).catch([]),
  skills: z.array(z.string()).catch([]).transform((a) => [...new Set(a.map((s) => String(s).trim()).filter((s) => s && s.length <= 40))].slice(0, 30)),
  languages: z.array(z.object({
    language: txt(40),
    proficiency: z.enum(["basic", "conversational", "professional", "native"]).catch("conversational"),
  }).catch({ language: "", proficiency: "conversational" as const })).max(10).catch([]),
  certificates: z.array(z.object({ name: txt(160), issuer: txt(120), year: yr }).catch({ name: "", issuer: "", year: "" })).max(15).catch([]),
  links: z.array(z.object({ label: txt(50), url: txt(300) }).catch({ label: "", url: "" })).max(6).catch([]),
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const rl = await checkRateLimitDual(req, ctx.userId, RATE_LIMIT_CONFIGS.ai);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const b = parsed.data;

  try {
    if (b.action === "extract") {
      const prompt = `A job seeker described themselves in their own words (any language, maybe rough). Sort it into CV fields.
Rules:
- Use ONLY facts they wrote. Never invent employers, schools, dates, numbers, skills or links. Leave a field "" or [] when they did not say it.
- Write everything in clear professional English; fix spelling.
- jobs = paid work only. projects = college projects, internships, volunteering, personal projects.
- Each job / project "description": 2-5 CV bullet lines from what they said they did, each starting "• " with an action verb, no first person, joined by "\n".
- Dates: "YYYY-MM" when they gave a month, "YYYY" when only a year, else "". current=true only if they say they still do it.
- education.level: one of doctorate, masters, graduation (bachelor's), diploma (incl. ITI / polytechnic), 12th (higher secondary / plus two / A-level), 10th, below_10th. One entry per school or college they mention, highest first.
- languages proficiency: basic | conversational | professional | native.
- targetRole: the job they say they want; else the job that best fits what they wrote.
- summary: 2-3 sentences, starting with who they are as a noun phrase, no "I", only their facts.
${b.fresher ? "- They said they are a fresher / student." : ""}

What they wrote:
"""
${clean(b.text)}
"""

Return ONLY JSON, no markdown, exactly this shape:
{"targetRole":"","summary":"","jobs":[{"title":"","organisation":"","start":"","end":"","current":false,"description":""}],"projects":[{"title":"","organisation":"","start":"","end":"","current":false,"description":""}],"education":[{"level":"","course":"","field":"","institution":"","startYear":"","endYear":"","studying":false,"grade":""}],"skills":[""],"languages":[{"language":"","proficiency":""}],"certificates":[{"name":"","issuer":"","year":""}],"links":[{"label":"","url":""}]}`;
      const out = (await generateText(prompt, GEMINI_MODELS.flash, 2500)).replace(/```json\n?|```/g, "").trim();
      const start = out.indexOf("{");
      const end = out.lastIndexOf("}");
      let raw: unknown = {};
      try {
        raw = JSON.parse(out.slice(start, end + 1));
      } catch {
        return NextResponse.json({ error: "We couldn't read that. Try again, or fill it in step by step." }, { status: 422 });
      }
      const data = extracted.parse(raw);
      // One "• " bullet per line, whatever the model did with the dots.
      const bullets = (text: string) => text.split(/\n+|\s+•\s+/).map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim()).filter(Boolean).map((l) => `• ${l}`).join("\n");
      const withBullets = <T extends { description: string }>(list: T[]) => list.map((e) => ({ ...e, description: bullets(e.description) }));
      return NextResponse.json({
        ...data,
        jobs: withBullets(data.jobs.filter((j) => j.title)),
        projects: withBullets(data.projects.filter((j) => j.title)),
        education: data.education.filter((e) => e.course || e.institution || e.level),
        languages: data.languages.filter((l) => l.language),
        certificates: data.certificates.filter((c) => c.name),
        links: data.links.filter((l) => l.url),
      });
    }

    if (b.action === "describe") {
      const what = b.kind === "job"
        ? `the job "${clean(b.title)}"${b.organisation ? ` at ${clean(b.organisation)}` : ""}`
        : `the project / internship / activity "${clean(b.title)}"${b.organisation ? ` (${clean(b.organisation)})` : ""}`;
      const prompt = b.text.trim()
        ? `Turn what a job seeker wrote about ${what} into 3-5 short CV bullet points.
Rules:
- Start each with a strong past or present action verb; no first person
- Keep only facts they gave; never add numbers, tools or results they did not mention
- Fix spelling and grammar; plain English; each bullet under 20 words
- If they wrote in another language, write the bullets in English

What they wrote:
${clean(b.text)}

Return ONLY the bullets, one per line, each starting with "• ".`
        : `Write 3-4 short, typical CV bullet points for ${what}${b.targetRole ? ` for someone aiming at ${clean(b.targetRole)} roles` : ""}.
They are a starting point the seeker will edit, so keep them general and true for most people in this role: no numbers, no named tools unless the role clearly needs them.
Each under 18 words, starting with an action verb, no first person.

Return ONLY the bullets, one per line, each starting with "• ".`;
      const out = (await generateText(prompt, GEMINI_MODELS.flash, 300)).trim();
      const bullets = out
        .split("\n")
        .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
        .filter((l) => l.length > 3)
        .slice(0, 6);
      return NextResponse.json({ text: bullets.map((l) => `• ${l}`).join("\n") });
    }

    if (b.action === "skills") {
      const prompt = `Suggest up to 12 skills for a job seeker's CV.
Target role: ${clean(b.targetRole) || "not given"}
Jobs / projects: ${clean(b.titles.join("; ")) || "none"}
What they did:
${clean(b.text) || "not given"}
Already listed (do not repeat): ${clean(b.have.join(", ")) || "none"}

Mix hard skills (tools, methods, trades) with 2-3 soft skills. Prefer skills their description shows; then common ones for the role.
Each skill 1-4 words, as employers write them.
Return ONLY a JSON array of strings.`;
      const out = (await generateText(prompt, GEMINI_MODELS.flash, 300)).replace(/```json\n?|```/g, "").trim();
      let skills: string[] = [];
      try {
        const arr = JSON.parse(out) as unknown;
        if (Array.isArray(arr)) skills = arr.filter((s): s is string => typeof s === "string");
      } catch {
        skills = out.split(/[\n,]/).map((s) => s.replace(/^[\s"'[\]•-]+|[\s"'[\]]+$/g, ""));
      }
      const have = new Set(b.have.map((s) => s.toLowerCase()));
      skills = [...new Set(skills.map((s) => s.trim()).filter((s) => s.length > 1 && s.length <= 40 && !have.has(s.toLowerCase())))].slice(0, 12);
      return NextResponse.json({ skills });
    }

    const prompt = `Write a CV profile summary of 2-3 sentences (40-70 words) for this job seeker.
Rules:
- Start with who they are as a noun phrase, e.g. "Retail sales associate with experience in…" — never "I", never their name, never "leverages"
- Plain, warm, specific words; no buzzwords like "dynamic", "results-driven", "hard-working team player"
- Only the facts below; never invent years, employers or results
${b.fresher ? "They are a fresher / student looking for their first job — focus on education, projects and eagerness to start." : ""}
Target role: ${clean(b.targetRole) || "not given"}
${b.years ? `Experience: about ${clean(b.years)} years` : ""}
Jobs / projects: ${clean(b.titles.join("; ")) || "none"}
Skills: ${clean(b.skills.join(", ")) || "none"}
Education: ${clean(b.education) || "not given"}

Return ONLY the summary text.`;
    const summary = (await generateText(prompt, GEMINI_MODELS.flash, 250)).trim().replace(/^["']|["']$/g, "");
    return NextResponse.json({ text: summary });
  } catch (err) {
    logger.warn({ err, userId: ctx.userId, action: b.action }, "CV builder AI unavailable");
    return NextResponse.json({ error: "Writing help isn't available right now. You can type it yourself." }, { status: 503 });
  }
}, { aiQuota: true });
