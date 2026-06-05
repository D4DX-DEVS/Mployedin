import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { enforceFeatureGate } from "@/lib/subscription/featureGate";
import { connectDB } from "@/lib/db/mongoose";
import Application from "@/models/Application";
import Job from "@/models/Job";
import JobSeeker from "@/models/JobSeeker";
import { routeGenerate } from "@/lib/ai/router";
import { redactPII } from "@/lib/ai/sanitize";
import { checkRateLimitDual, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";

/**
 * GET /api/ai/daily-insights
 *
 * Returns personalized AI-generated daily insights for the current user
 * based on their role and recent platform activity.
 */
export const GET = withAuth(async (_req: NextRequest, ctx) => {
  const locale = _req.nextUrl.searchParams.get("locale") === "ar" ? "ar" : "en";
  const isArabic = locale === "ar";
  const gateErr = await enforceFeatureGate(ctx.userId, ctx.role, { type: "ai", feature: "ai_daily_insights" });
  if (gateErr) return gateErr;

  const rl = checkRateLimitDual(_req, ctx.userId, RATE_LIMIT_CONFIGS.ai);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  await connectDB();

  const today = new Date();
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

  let contextData = "";

  if (ctx.role === "job_seeker") {
    const [seeker, recentApps] = await Promise.all([
      JobSeeker.findOne({ userId: ctx.userId }).lean(),
      Application.find({ jobSeekerId: ctx.userId, createdAt: { $gte: yesterday } }).lean(),
    ]);

    // Recalculate completeness on the fly so insights always reflect current state
    const doc = seeker as Record<string, unknown> | null;
    let liveCompleteness = 0;
    if (doc) {
      if (doc.userId) liveCompleteness += 10;
      if (doc.nationality) liveCompleteness += 10;
      if (doc.currentLocation) liveCompleteness += 5;
      if (doc.summary) liveCompleteness += 10;
      if (Array.isArray(doc.skills) && doc.skills.length) liveCompleteness += 20;
      if (Array.isArray(doc.experience) && doc.experience.length) liveCompleteness += 20;
      if (Array.isArray(doc.education) && doc.education.length) liveCompleteness += 15;
      if (Array.isArray(doc.languages) && doc.languages.length) liveCompleteness += 5;
      const socialLinks = doc.socialLinks as Array<{ label?: string }> | undefined;
      if (doc.linkedin || socialLinks?.some((l) => l.label?.toLowerCase() === "linkedin")) liveCompleteness += 5;
      liveCompleteness = Math.min(100, liveCompleteness);
    }

    // Identify missing profile sections for actionable guidance
    const missingSections: string[] = [];
    if (!doc?.summary) missingSections.push("Professional summary");
    if (!Array.isArray(doc?.skills) || !(doc.skills as unknown[]).length) missingSections.push("Skills");
    if (!Array.isArray(doc?.experience) || !(doc.experience as unknown[]).length) missingSections.push("Work experience");
    if (!Array.isArray(doc?.education) || !(doc.education as unknown[]).length) missingSections.push("Education");
    if (!Array.isArray(doc?.languages) || !(doc.languages as unknown[]).length) missingSections.push("Languages");
    if (!doc?.nationality) missingSections.push("Nationality");

    contextData = `
Role: Job Seeker
Profile completeness: ${liveCompleteness}%
${missingSections.length > 0 ? `Missing sections: ${missingSections.join(", ")}` : "Profile is complete."}
Skills: ${(seeker?.skills ?? []).slice(0, 5).join(", ")}
New applications today: ${recentApps.length}`;
  } else if (ctx.role === "employer") {
    const [activeJobs, newApps] = await Promise.all([
      Job.countDocuments({ employerId: ctx.userId, status: "active" }),
      Application.countDocuments({ createdAt: { $gte: yesterday } }),
    ]);

    contextData = `
Role: Employer
Active job listings: ${activeJobs}
New applications today: ${newApps}`;
  } else {
    contextData = `Role: ${ctx.role}`;
  }

  const prompt = `You are an AI assistant for MPLOYEDIN, a Gulf recruitment platform.

USER CONTEXT:
${contextData}
Current date: ${today.toLocaleDateString(isArabic ? "ar-AE" : "en-AE")}

Output language: ${isArabic ? "Arabic" : "English"}.
${isArabic ? "IMPORTANT: Write every user-facing title, message, and action in Arabic. Keep proper nouns only if they are names, roles, companies, or skills from the user data." : ""}

Generate 3 personalized, actionable daily insights for this user. Each insight should be:
- Specific and relevant to their role
- Actionable with a clear next step
- Professional and encouraging in tone

Return ONLY a JSON array (no markdown):
[
  { "type": "tip|alert|opportunity|metric", "title": "...", "message": "...", "action": "..." },
  ...
]`;

  const arabicFallbackInsights = [
    {
      type: "tip",
      title: "حدّث ملفك المهني",
      message: "راجع الملخص والمهارات والتفضيلات حتى تظهر لك فرص أكثر دقة في أسواق الخليج.",
      action: "تحديث الملف الشخصي",
    },
    {
      type: "opportunity",
      title: "راجع الوظائف المطابقة",
      message: "افتح التوصيات الجديدة اليوم وركّز على الوظائف ذات نسبة التطابق الأعلى.",
      action: "عرض الوظائف المطابقة",
    },
    {
      type: "metric",
      title: "تابع نشاطك اليومي",
      message: "راقب الطلبات والمقابلات والمشاهدات من لوحة التحكم لتحسين خطواتك التالية.",
      action: "فتح لوحة التحكم",
    },
  ];

  const localizeArabicInsightText = (value: unknown): string => {
    return String(value ?? "")
      .replace(/\d+/g, (match) => Number(match).toLocaleString("ar-SA"))
      .replace(/\bGulf\b/g, "الخليج")
      .replace(/\bUAE\b/g, "الإمارات")
      .replace(/\bSaudi Arabia\b/g, "المملكة العربية السعودية");
  };

  const normalizeArabicInsights = (items: unknown[]) =>
    items.map((insight) => {
      const item = insight as Record<string, unknown>;
      return {
        ...item,
        title: localizeArabicInsightText(item.title),
        message: localizeArabicInsightText(item.message),
        action: localizeArabicInsightText(item.action),
      };
    });

  const text = await routeGenerate(prompt, "chat");
  let insights;
  try {
    const cleaned = redactPII(text).replace(/```json\n?|```\n?/g, "").trim();
    insights = JSON.parse(cleaned);
    if (!Array.isArray(insights)) throw new Error("Invalid insights payload");

    const visibleInsightText = insights
      .map((insight) => `${insight?.title ?? ""} ${insight?.message ?? ""} ${insight?.action ?? ""}`)
      .join(" ");

    if (isArabic && !/[\u0600-\u06FF]/.test(visibleInsightText)) {
      insights = arabicFallbackInsights;
    } else if (isArabic) {
      insights = normalizeArabicInsights(insights);
    }
  } catch {
    insights = isArabic
      ? arabicFallbackInsights
      : [{ type: "tip", title: "Get Started", message: text.slice(0, 200), action: "Check your dashboard" }];
  }

  return NextResponse.json({ insights, generatedAt: new Date().toISOString() });
}, { aiQuota: true });
