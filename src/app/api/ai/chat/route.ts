import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { enforceFeatureGate } from "@/lib/subscription/featureGate";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { enforceDailyAiQuota } from "@/lib/ai/dailyQuota";
import { sanitizeChatMessages, sanitizeAIInput, AI_TOKEN_LIMITS } from "@/lib/ai/sanitize";
import { GEMINI_MODELS } from "@/lib/ai/gemini";
import { getAssistantSystemPrompt, SCOPE_GUARD, type AssistantContext } from "@/lib/ai/assistantPrompts";
import { connectDB } from "@/lib/db/mongoose";
import { validateBody } from "@/lib/validators";
import { aiChatSchema } from "@/lib/validators/ai";
import JobSeeker from "@/models/JobSeeker";
import Job from "@/models/Job";
import User from "@/models/User";
import Employer from "@/models/Employer";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import Lead from "@/models/Lead";
import Application from "@/models/Application";
import Interview from "@/models/Interview";
import Placement from "@/models/Placement";
import SavedJob from "@/models/SavedJob";
import Offer from "@/models/Offer";
import ProfileView from "@/models/ProfileView";
import Commission from "@/models/Commission";
import BlogPost from "@/models/BlogPost";
import FAQ from "@/models/FAQ";
import Banner from "@/models/Banner";
import ContactSubmission from "@/models/ContactSubmission";
import Testimonial from "@/models/Testimonial";
import AuditLog from "@/models/AuditLog";
import { logActivity } from "@/lib/audit/log";
import type { UserRole } from "@/types/user";
import logger from "@/lib/logger";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const CHAT_MODEL = GEMINI_MODELS.flash;

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Subscription feature gate
    const userRole = (session.user as unknown as { role: string }).role;
    const gateErr = await enforceFeatureGate(session.user.id!, userRole, { type: "ai", feature: "ai_chat" });
    if (gateErr) return gateErr;

    // Rate limit AI calls per user
    const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown";
    const { allowed, remaining, resetAt } = await checkRateLimit(
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

    // Mongo-backed daily AI quota (matches every other AI route)
    const __aiQuota = await enforceDailyAiQuota(session.user.id!, userRole as UserRole);
    if (__aiQuota) return __aiQuota;

    const body = await validateBody(req, aiChatSchema);
    const messages = sanitizeChatMessages(body.messages ?? [], 50, 4000);
    const context = body.context ? sanitizeAIInput(String(body.context), 2000) : undefined;
    const currentPage = body.currentPage ? sanitizeAIInput(String(body.currentPage), 200) : undefined;

    if (!messages.length) {
      return NextResponse.json({ error: "messages array required" }, { status: 400 });
    }

    // Fetch user profile + real platform jobs for context-aware AI responses
    let profileContext = "";
    let jobsContext = "";
    let roleStatsContext = "";

    if (userRole === "job_seeker") {
      try {
        await connectDB();
        const [user, profile] = await Promise.all([
          User.findById(session.user.id).select("name email").lean(),
          JobSeeker.findOne({ userId: session.user.id })
            .select("skills experience education languages certifications headline workStatus totalExperienceYears totalExperienceMonths currentLocation preferredCountries preferredRoles preferredSalary preferredJobType availabilityStatus industry nationality cv.originalUrl cv.atsScore cv.atsReport.rating cv.atsReport.recommendations cv.atsAnalyzedAt cv.rawText cv.parsedAt")
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

          // Application history + interviews + saved jobs — so AI can exclude
          // applied jobs and answer "what did I apply to / any interviews?"
          const [appliedJobIds, recentApps, upcomingInterviews, savedJobIds, pendingOffers, profileViewsThisWeek] = await Promise.all([
            Application.find({ jobSeekerId: profile._id }).distinct("jobId"),
            Application.find({ jobSeekerId: profile._id })
              .select("jobId status aiMatchScore matchGaps appliedAt")
              .sort({ appliedAt: -1 })
              .limit(10)
              .populate("jobId", "title")
              .lean(),
            Interview.find({
              jobSeekerId: profile._id,
              status: { $in: ["scheduled", "confirmed", "rescheduled"] },
              scheduledAt: { $gte: new Date() },
            })
              .select("jobId scheduledAt")
              .sort({ scheduledAt: 1 })
              .limit(5)
              .populate("jobId", "title")
              .lean(),
            // Saved jobs are keyed by the JobSeeker profile _id, like the sibling
            // queries above — session.user.id is a User id and matched nothing.
            SavedJob.find({ jobSeekerId: profile._id }).distinct("jobId"),
            Offer.find({
              jobSeekerId: profile._id,
              status: { $in: ["pending", "countered"] },
              expiresAt: { $gte: new Date() },
            })
              .select("jobId salary expiresAt status")
              .populate("jobId", "title")
              .lean(),
            ProfileView.countDocuments({
              jobSeekerId: session.user.id,
              viewedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
            }),
          ]);

          let activityContext = "";
          if (recentApps.length) {
            const appLines = recentApps.map((a) => {
              const title = (a.jobId as unknown as { title?: string } | null)?.title ?? "a job";
              const date = a.appliedAt ? ` (applied ${new Date(a.appliedAt).toISOString().slice(0, 10)})` : "";
              const score = a.aiMatchScore != null ? ` | match score ${a.aiMatchScore}%` : "";
              const gaps = a.matchGaps?.length ? ` | skill gaps: ${a.matchGaps.slice(0, 3).join(", ")}` : "";
              return `- ${title}: ${a.status.replace(/_/g, " ")}${date}${score}${gaps}`;
            });
            activityContext += `\n\n## User's Applications (${appliedJobIds.length} total — jobs already applied to are EXCLUDED from the live jobs list below; never recommend a job the user already applied to)\n${appLines.join("\n")}`;
          } else {
            activityContext += `\n\n## User's Applications\nThe user has not applied to any jobs yet.`;
          }
          if (upcomingInterviews.length) {
            const intLines = upcomingInterviews.map((i) => {
              const title = (i.jobId as unknown as { title?: string } | null)?.title ?? "a job";
              return `- ${title}: ${new Date(i.scheduledAt).toUTCString()}`;
            });
            activityContext += `\n\n## Upcoming Interviews\n${intLines.join("\n")}`;
          }
          if (pendingOffers.length) {
            const offerLines = pendingOffers.map((o) => {
              const title = (o.jobId as unknown as { title?: string } | null)?.title ?? "a job";
              const sal = o.salary ? ` | ${o.salary.currency} ${o.salary.amount.toLocaleString()}/${o.salary.period}` : "";
              return `- ${title}: ${o.status}${sal} | expires ${new Date(o.expiresAt).toISOString().slice(0, 10)}`;
            });
            activityContext += `\n\n## Pending Job Offers (remind the user to respond before expiry)\n${offerLines.join("\n")}`;
          }
          if (profileViewsThisWeek > 0) {
            activityContext += `\n\n## Profile Engagement\n${profileViewsThisWeek} employer view(s) of the user's profile in the last 7 days — mention as encouragement when relevant.`;
          }

          // Profile completeness — nudge material when user asks how to improve chances
          const missingSections: string[] = [];
          if (!profile.headline) missingSections.push("headline");
          if (!profile.skills?.length) missingSections.push("skills");
          if (!profile.experience?.length) missingSections.push("work experience");
          if (!profile.education?.length) missingSections.push("education");
          if (!profile.languages?.length) missingSections.push("languages");
          if (!profile.certifications?.length) missingSections.push("certifications");
          if (!profile.preferredRoles?.length) missingSections.push("preferred roles");
          if (!profile.currentLocation) missingSections.push("current location");
          if (missingSections.length) {
            activityContext += `\n\n## Profile Gaps\nMissing profile sections: ${missingSections.join(", ")}. If the user asks how to improve their chances or visibility, suggest completing these first.`;
          }

          // CV / ATS analysis — cached result from the platform's ATS checker
          const cv = profile.cv as
            | { originalUrl?: string; atsScore?: number; atsAnalyzedAt?: Date; atsReport?: { rating?: string; recommendations?: string[] }; rawText?: string; parsedAt?: Date }
            | undefined;
          if (cv?.atsScore != null) {
            const recs = cv.atsReport?.recommendations?.slice(0, 5) ?? [];
            activityContext += `\n\n## CV / ATS Analysis (real cached result from MPLOYEDIN's ATS checker — this IS the user's actual ATS score, share it when asked)\n- ATS score: ${cv.atsScore}/100${cv.atsReport?.rating ? ` (${cv.atsReport.rating})` : ""}${cv.atsAnalyzedAt ? ` | analyzed ${new Date(cv.atsAnalyzedAt).toISOString().slice(0, 10)}` : ""}${recs.length ? `\n- Top recommendations:\n${recs.map((r) => `  - ${r}`).join("\n")}` : ""}`;
          } else if (cv?.originalUrl) {
            activityContext += `\n\n## CV / ATS Analysis\nThe user has uploaded a CV but has not run the ATS check yet. Tell them to run the ATS analysis from their CV section to get a real score — do NOT invent a score.`;
          } else {
            activityContext += `\n\n## CV / ATS Analysis\nThe user has not uploaded a CV yet. Suggest uploading one from their profile so employers and the ATS checker can read it.`;
          }
          if (cv?.rawText) {
            const cvText = sanitizeAIInput(cv.rawText, 4000);
            activityContext += `\n\n## CV Content (text extracted from the user's actual uploaded CV${cv.parsedAt ? `, parsed ${new Date(cv.parsedAt).toISOString().slice(0, 10)}` : ""} — answer CV questions from this, quote it when useful, and point out mismatches between the CV and the profile data above)\n"""\n${cvText}\n"""`;
          }

          // Fetch real active jobs from MPLOYEDIN database matching user's skills
          const userSkills: string[] = profile.skills ?? [];
          // ponytail: case-insensitive skill match tolerant of ".js" suffix ("React" ↔ "React.js")
          const skillRegexes = userSkills.map((s) => {
            const base = s.trim().replace(/\.js$/i, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            return new RegExp(`^${base}(\\.js)?$`, "i");
          });
          const skillFilter = skillRegexes.length > 0
            ? { "requirements.skills": { $in: skillRegexes } }
            : {};

          const savedSet = new Set(savedJobIds.map(String));
          const candidateJobs = await Job.find({
            status: "active",
            _id: { $nin: appliedJobIds },
            ...skillFilter,
          })
            .select("_id title category location requirements salary tags description workMode")
            .sort({ createdAt: -1 })
            .limit(30)
            .lean();

          // Rank by profile preferences (country, role, work mode); stable sort keeps newest first within ties
          const prefCountries = (profile.preferredCountries ?? []).map((c: string) => c.toLowerCase());
          const prefRoles = (profile.preferredRoles ?? []).map((r: string) => r.toLowerCase());
          const prefMode = profile.preferredJobType;
          const liveJobs = candidateJobs
            .map((j) => {
              let score = 0;
              const country = j.location?.country?.toLowerCase() ?? "";
              if (prefCountries.includes(country)) score += 2;
              if (j.location?.isRemote && prefMode !== "onsite") score += 2;
              const title = j.title.toLowerCase();
              if (prefRoles.some((r: string) => title.includes(r))) score += 2;
              if (prefMode && prefMode !== "any" && j.workMode === prefMode) score += 1;
              return { j, score };
            })
            .sort((a, b) => b.score - a.score)
            .slice(0, 10)
            .map((x) => x.j);

          if (liveJobs.length > 0) {
            const jobLines = liveJobs.map((j) => {
              const loc = j.location.isRemote
                ? "Remote"
                : `${j.location.city}, ${j.location.country}`;
              const sal = j.salary?.min && j.salary?.max
                ? ` | ${j.salary.currency} ${j.salary.min.toLocaleString()}–${j.salary.max.toLocaleString()} ${j.salary.period ?? ""}`
                : j.salary?.isNegotiable ? " | Salary negotiable" : "";
              const skills = j.requirements?.skills?.slice(0, 5).join(", ") ?? "";
              const locale = currentPage?.match(/^\/(en|ar)\//)?.[1] ?? "en";
              const link = `/${locale}/job-seeker/jobs/${j._id}`;
              const saved = savedSet.has(String(j._id)) ? " | (user saved this job)" : "";
              return `- [${j.title}](${link}) | ${loc}${sal} | Skills: ${skills}${saved}`;
            });
            jobsContext = `\n\n## Live Jobs on MPLOYEDIN (ONLY reference these — never invent jobs)\n${jobLines.join("\n")}\n\nFormat EVERY job recommendation as a markdown link exactly like: [Job Title](/en/job-seeker/jobs/ID). CRITICAL: Use ONLY the relative URLs provided above (starting with /). NEVER prepend a domain like https://mployedin.com or https://www.mployedin.com. Never show raw IDs. Always copy the link EXACTLY as provided in the list above so users can click to view the job. Tell the user they can click the job title to view and apply. Do NOT mention any job not in this list.`;
          } else {
            jobsContext = `\n\n## Live Jobs on MPLOYEDIN\nNo active jobs currently match the user's skill set (jobs already applied to are excluded). Tell the user honestly that there are no new matching roles right now and suggest they check their job feed for the latest listings or update their skills.`;
          }
          jobsContext = activityContext + jobsContext;
        }
      } catch (err) {
        logger.error({ err }, "[AI Chat] Failed to fetch user profile");
        // Continue without profile — graceful degradation
      }
    }

    // ─── Admin stats injection — comprehensive platform data ─────
    if (userRole === "admin" && context === "admin_assist") {
      try {
        await connectDB();
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        // ── People stats ──
        const [
          totalUsers, totalEmployers, totalAgents, totalSuperAgents, totalSeekers,
          newUsersThisMonth, newSeekersThisMonth, newEmployersThisMonth,
        ] = await Promise.all([
          User.countDocuments(),
          Employer.countDocuments(),
          Agent.countDocuments(),
          SuperAgent.countDocuments(),
          JobSeeker.countDocuments(),
          User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
          JobSeeker.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
          Employer.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
        ]);

        // ── Jobs stats ──
        const [
          activeJobs, draftJobs, closedJobs, expiredJobs,
          jobsCreatedThisMonth,
        ] = await Promise.all([
          Job.countDocuments({ status: "active" }),
          Job.countDocuments({ status: "draft" }),
          Job.countDocuments({ status: "closed" }),
          Job.countDocuments({ status: "expired" }),
          Job.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
        ]);

        // ── Applications stats ──
        const [
          totalApplications, appliedApps, shortlistedApps,
          interviewApps, hiredApps, rejectedApps,
          appsThisWeek,
        ] = await Promise.all([
          Application.countDocuments(),
          Application.countDocuments({ status: "applied" }),
          Application.countDocuments({ status: "shortlisted" }),
          Application.countDocuments({ status: "interview_scheduled" }),
          Application.countDocuments({ status: "hired" }),
          Application.countDocuments({ status: "rejected" }),
          Application.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
        ]);

        // ── Hiring pipeline stats ──
        const [
          totalInterviews, scheduledInterviews,
          totalPlacements, placementsThisMonth,
        ] = await Promise.all([
          Interview.countDocuments(),
          Interview.countDocuments({ status: "scheduled" }),
          Placement.countDocuments(),
          Placement.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
        ]);

        // ── Finance stats ──
        const [
          pendingCommissions, approvedCommissions, paidCommissions,
        ] = await Promise.all([
          Commission.countDocuments({ status: "pending" }),
          Commission.countDocuments({ status: "approved" }),
          Commission.countDocuments({ status: "paid" }),
        ]);

        // ── CMS stats ──
        const [
          totalBlogs, totalFAQs, totalBanners, totalTestimonials,
          unreadContacts,
        ] = await Promise.all([
          BlogPost.countDocuments(),
          FAQ.countDocuments(),
          Banner.countDocuments(),
          Testimonial.countDocuments(),
          ContactSubmission.countDocuments({ status: { $in: ["new", "unread"] } }),
        ]);

        // ── Recent jobs (last 5) for context ──
        const recentJobs = await Job.find()
          .select("title status location.country category createdAt")
          .sort({ createdAt: -1 })
          .limit(5)
          .lean();
        const recentJobLines = recentJobs.map((j) =>
          `  - "${j.title}" | ${j.status} | ${j.location?.country ?? "?"} | ${j.category ?? "?"} | ${new Date(j.createdAt).toLocaleDateString()}`
        ).join("\n");

        // ── Top categories ──
        const topCategories = await Job.aggregate([
          { $match: { status: "active" } },
          { $group: { _id: "$category", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 5 },
        ]);
        const categoryLines = topCategories.map((c: { _id: string; count: number }) => `  - ${c._id}: ${c.count} active`).join("\n");

        roleStatsContext = `

## Platform Data (REAL database data — base ALL answers on this)

### People
- Total users: ${totalUsers} (new this month: ${newUsersThisMonth})
- Job seekers: ${totalSeekers} (new this month: ${newSeekersThisMonth})
- Employers: ${totalEmployers} (new this month: ${newEmployersThisMonth})
- Agents: ${totalAgents}
- Super-agents: ${totalSuperAgents}

### Jobs
- Active: ${activeJobs} | Draft: ${draftJobs} | Closed: ${closedJobs} | Expired: ${expiredJobs}
- Created this month: ${jobsCreatedThisMonth}
- Top categories:
${categoryLines || "  (no active jobs)"}

### Applications
- Total: ${totalApplications} (this week: ${appsThisWeek})
- Applied: ${appliedApps} | Shortlisted: ${shortlistedApps} | Interview: ${interviewApps} | Hired: ${hiredApps} | Rejected: ${rejectedApps}

### Hiring Pipeline
- Total interviews: ${totalInterviews} | Scheduled: ${scheduledInterviews}
- Total placements: ${totalPlacements} (this month: ${placementsThisMonth})

### Finance
- Commissions — Pending: ${pendingCommissions} | Approved: ${approvedCommissions} | Paid: ${paidCommissions}

### CMS Content
- Blog posts: ${totalBlogs} | FAQs: ${totalFAQs} | Banners: ${totalBanners} | Testimonials: ${totalTestimonials}
- Unread contact submissions: ${unreadContacts}

### Recent Jobs
${recentJobLines || "  (no jobs yet)"}`;
      } catch (err) {
        logger.error({ err }, "[AI Chat] Failed to fetch admin stats");
      }
    }

    // ─── Super-agent stats injection (enriched with per-agent KPIs) ─
    if (userRole === "super_agent" && context === "super_agent_assist") {
      try {
        await connectDB();
        const saProfile = await SuperAgent.findOne({ userId: session.user.id }).select("_id agentIds").lean();
        if (saProfile) {
          const agentIds = saProfile.agentIds ?? [];
          const agentDocs = agentIds.length > 0
            ? await Agent.find({ _id: { $in: agentIds } }).select("userId activityLog assignedEmployerIds").lean()
            : [];
          const agentUserIds = agentDocs.map((a) => a.userId);
          const agentUserIdStrs = agentUserIds.map((id) => id.toString());

          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

          const [users, allLeads, teamPlacementCount, teamJobs] = await Promise.all([
            User.find({ _id: { $in: agentUserIds } }).select("name email").lean(),
            // Lead/Placement.agentId ref the Agent doc, not the User
            Lead.find({ agentId: { $in: agentIds } })
              .select("agentId status createdAt convertedAt followUpAt activityLog")
              .lean(),
            Placement.countDocuments({ agentId: { $in: agentIds } }),
            Job.countDocuments({ postedBy: { $in: agentUserIds }, status: "active" }),
          ]);

          const userMap = new Map(users.map((u) => [u._id.toString(), u]));

          // Per-agent breakdown for AI context
          const agentLines = agentDocs.map((agentDoc) => {
            const user = userMap.get(agentDoc.userId?.toString() ?? "");
            const agentLeads = allLeads.filter((l) => l.agentId?.toString() === agentDoc._id.toString());
            const converted = agentLeads.filter((l) => l.status === "converted").length;
            const rate = agentLeads.length > 0 ? Math.round((converted / agentLeads.length) * 100) : 0;
            const overdue = agentLeads.filter(
              (l) => l.followUpAt && new Date(l.followUpAt) < new Date() && l.status !== "converted" && l.status !== "lost"
            ).length;
            const stale = agentLeads.filter((l) => {
              if (l.status !== "contacted" && l.status !== "interested") return false;
              const lastAct = l.activityLog?.length
                ? new Date(l.activityLog[l.activityLog.length - 1].timestamp)
                : new Date(l.createdAt);
              return (Date.now() - lastAct.getTime()) / (1000 * 60 * 60 * 24) > 7;
            }).length;
            // Avg response time
            const responseTimes = agentLeads
              .filter((l) => l.activityLog && l.activityLog.length > 0)
              .map((l) => (new Date(l.activityLog![0].timestamp).getTime() - new Date(l.createdAt).getTime()) / (1000 * 60 * 60))
              .filter((h) => h > 0 && h < 720);
            const avgResp = responseTimes.length > 0
              ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
              : null;

            return `  - ${user?.name ?? "Unknown"} (${user?.email ?? "?"}): ${agentLeads.length} leads, ${converted} conversions (${rate}%), ${overdue} overdue follow-ups, ${stale} stale leads${avgResp !== null ? `, avg response ${avgResp}h` : ""}`;
          });

          // Pipeline summary
          const pipelineCounts: Record<string, number> = {};
          for (const l of allLeads) {
            pipelineCounts[l.status] = (pipelineCounts[l.status] ?? 0) + 1;
          }
          const pipelineLines = Object.entries(pipelineCounts).map(([s, c]) => `${s}: ${c}`).join(" | ");

          // Conversions this week vs last week
          const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
          const convThisWeek = allLeads.filter(
            (l) => l.status === "converted" && l.convertedAt && new Date(l.convertedAt) >= sevenDaysAgo
          ).length;
          const convLastWeek = allLeads.filter((l) => {
            if (l.status !== "converted" || !l.convertedAt) return false;
            const d = new Date(l.convertedAt);
            return d >= fourteenDaysAgo && d < sevenDaysAgo;
          }).length;

          roleStatsContext = `

## Team Stats (live data — use naturally, reference agents by name)
- Managed agents: ${agentUserIdStrs.length}
- Total team leads: ${allLeads.length}
- Total team placements: ${teamPlacementCount}
- Active team jobs: ${teamJobs}

### Lead Pipeline
${pipelineLines || "(no leads)"}

### Conversion Trend
- This week: ${convThisWeek} | Last week: ${convLastWeek}${convLastWeek > 0 ? ` (${convThisWeek >= convLastWeek ? "+" : ""}${Math.round(((convThisWeek - convLastWeek) / convLastWeek) * 100)}%)` : ""}

### Per-Agent Performance
${agentLines.join("\n")}

Use this data to answer questions about team performance, identify underperformers, suggest lead redistribution, and provide actionable advice. Always cite specific agent names and numbers.`;
        }
      } catch (err) {
        logger.error({ err }, "[AI Chat] Failed to fetch super-agent stats");
      }
    }

    // ─── Agent stats injection ──────────────────────────────────
    if (userRole === "agent" && context === "agent_assist") {
      try {
        await connectDB();
        const agentProfile = await Agent.findOne({ userId: session.user.id }).select("_id").lean();
        if (agentProfile) {
          const [activeJobsList, totalApps, myLeads, upcomingInterviews, placements] = await Promise.all([
            Job.find({ postedBy: session.user.id, status: "active" })
              .select("title location.country")
              .sort({ createdAt: -1 })
              .limit(10)
              .lean(),
            Application.countDocuments({ agentId: agentProfile._id }),
            Lead.find({ agentId: agentProfile._id })
              .select("companyName status followUpAt")
              .lean(),
            Interview.find({
              agentId: agentProfile._id,
              status: { $in: ["scheduled", "confirmed", "rescheduled"] },
              scheduledAt: { $gte: new Date() },
            })
              .select("scheduledAt jobId")
              .sort({ scheduledAt: 1 })
              .limit(5)
              .populate("jobId", "title")
              .lean(),
            Placement.countDocuments({ agentId: agentProfile._id }),
          ]);

          const pipeline: Record<string, number> = {};
          for (const l of myLeads) pipeline[l.status] = (pipeline[l.status] ?? 0) + 1;
          const pipelineLine = Object.entries(pipeline).map(([s, c]) => `${s}: ${c}`).join(" | ") || "(no leads)";
          const overdue = myLeads.filter(
            (l) => l.followUpAt && new Date(l.followUpAt) < new Date() && !["converted", "lost"].includes(l.status)
          );
          const overdueLines = overdue.slice(0, 5).map((l) => `  - ${l.companyName} (${l.status})`).join("\n");
          const jobLines = activeJobsList.map((j) => `  - ${j.title} (${j.location?.country ?? "?"})`).join("\n");
          const interviewLines = upcomingInterviews.map((i) => {
            const title = (i.jobId as unknown as { title?: string } | null)?.title ?? "a job";
            return `  - ${title}: ${new Date(i.scheduledAt).toUTCString()}`;
          }).join("\n");

          roleStatsContext = `\n\n## Pipeline Stats (live data — use naturally in responses)
- Active job postings: ${activeJobsList.length}${jobLines ? `\n${jobLines}` : ""}
- Total applications: ${totalApps}
- Placements: ${placements}

### Lead Pipeline
${pipelineLine}
${overdue.length ? `\n### Overdue Follow-ups (${overdue.length} — nudge the user to act on these)\n${overdueLines}` : ""}
${interviewLines ? `\n### Upcoming Interviews\n${interviewLines}` : ""}`;
        }
      } catch (err) {
        logger.error({ err }, "[AI Chat] Failed to fetch agent stats");
      }
    }

    // ─── Employer data injection (job_creator / interview_ai / screening_ai) ─
    // Grounds the recruitment assistant with the employer's OWN jobs and applicants
    // so Screening/Interview AI can rank real candidates without manual CV pasting.
    if (userRole === "employer" && ["job_creator", "interview_ai", "screening_ai", "employer_assist"].includes(context ?? "")) {
      try {
        await connectDB();
        const employer = await Employer.findOne({ userId: session.user.id }).select("_id companyName").lean();
        if (employer) {
          const employerId = employer._id;

          // Employer's own jobs (exclude soft-deleted), newest first
          const jobs = await Job.find({ employerId, deletedAt: { $exists: false } })
            .select("_id title status location requirements category")
            .sort({ createdAt: -1 })
            .limit(20)
            .lean();

          const jobIds = jobs.map((j) => j._id);
          const jobTitleMap = new Map(jobs.map((j) => [j._id.toString(), j.title]));

          // Per-job applicant pipeline counts
          const appCounts = jobIds.length
            ? await Application.aggregate([
                { $match: { jobId: { $in: jobIds }, status: { $ne: "withdrawn" } } },
                { $group: { _id: { jobId: "$jobId", status: "$status" }, count: { $sum: 1 } } },
              ])
            : [];
          const countsByJob = new Map<string, Record<string, number>>();
          for (const c of appCounts as Array<{ _id: { jobId: unknown; status: string }; count: number }>) {
            const jid = String(c._id.jobId);
            const m = countsByJob.get(jid) ?? {};
            m[c._id.status] = c.count;
            countsByJob.set(jid, m);
          }

          const jobLines = jobs.map((j) => {
            const loc = j.location?.isRemote
              ? "Remote"
              : `${j.location?.city ?? "?"}, ${j.location?.country ?? "?"}`;
            const skills = j.requirements?.skills?.slice(0, 6).join(", ") ?? "";
            const exp = j.requirements
              ? `${j.requirements.experienceMin ?? 0}–${j.requirements.experienceMax ?? "?"} yrs`
              : "";
            const counts = countsByJob.get(j._id.toString());
            const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;
            const pipeline = counts
              ? ` | Applicants: ${total} (${Object.entries(counts).map(([s, c]) => `${c} ${s.replace(/_/g, " ")}`).join(", ")})`
              : " | Applicants: 0";
            return `- ${j.title} (id: ${j._id}) | status: ${j.status} | ${loc}${exp ? ` | Experience: ${exp}` : ""}${skills ? ` | Required skills: ${skills}` : ""}${pipeline}`;
          });

          const jobsBlock = jobLines.length
            ? `\n\n## Your Job Postings (REAL data from ${employer.companyName ?? "your account"} — reference these directly, never invent jobs)\n${jobLines.join("\n")}`
            : `\n\n## Your Job Postings\nYou have not posted any jobs yet. If the user wants to screen candidates, tell them they need to post a job and receive applications first.`;

          // Applicant grounding for screening + interview tabs only
          let applicantsBlock = "";
          if (["screening_ai", "interview_ai"].includes(context ?? "") && jobIds.length) {
            const applications = await Application.find({
              jobId: { $in: jobIds },
              status: { $ne: "withdrawn" },
            })
              .select("jobId jobSeekerId status aiMatchScore matchStrengths matchGaps appliedAt")
              .sort({ aiMatchScore: -1, appliedAt: -1 })
              .limit(60)
              .lean();

            if (applications.length) {
              const seekerIds = [...new Set(applications.map((a) => a.jobSeekerId?.toString()).filter(Boolean))];
              const seekers = await JobSeeker.find({ _id: { $in: seekerIds } })
                .select("userId fullName headline skills experience education languages currentLocation nationality totalExperienceYears totalExperienceMonths")
                .lean();
              const seekerMap = new Map(seekers.map((s) => [s._id.toString(), s]));

              const userIds = seekers.map((s) => s.userId).filter(Boolean);
              const users = userIds.length
                ? await User.find({ _id: { $in: userIds } }).select("name").lean()
                : [];
              const userNameMap = new Map(users.map((u) => [u._id.toString(), u.name]));

              // Group applicants by job, capped per job to control token usage
              const byJob = new Map<string, typeof applications>();
              for (const app of applications) {
                const jid = app.jobId?.toString() ?? "";
                if (!byJob.has(jid)) byJob.set(jid, []);
                const arr = byJob.get(jid)!;
                if (arr.length < 10) arr.push(app);
              }

              const sections: string[] = [];
              for (const [jid, apps] of byJob) {
                const title = jobTitleMap.get(jid) ?? "Unknown role";
                const lines = apps.map((app, idx) => {
                  const s = seekerMap.get(app.jobSeekerId?.toString() ?? "");
                  const name =
                    s?.fullName ||
                    userNameMap.get(s?.userId?.toString() ?? "") ||
                    "Candidate";
                  const yrs = s?.totalExperienceYears ?? 0;
                  const mos = s?.totalExperienceMonths ?? 0;
                  const expStr = yrs || mos ? `${yrs}y${mos ? ` ${mos}m` : ""} exp` : "exp N/A";
                  const exps = (s?.experience ?? []) as Array<{ jobTitle?: string; company?: string; isCurrent?: boolean }>;
                  const latest = exps.find((e) => e.isCurrent) ?? exps[0];
                  const role = latest
                    ? `${latest.jobTitle}${latest.company ? ` @ ${latest.company}` : ""}`
                    : "—";
                  const edu = s?.education?.[0]
                    ? `${s.education[0].degree ?? ""}${s.education[0].field ? ` in ${s.education[0].field}` : ""}`.trim()
                    : "—";
                  const skills = s?.skills?.slice(0, 12).join(", ") || "—";
                  const langs = ((s?.languages ?? []) as Array<{ language?: string }>)
                    .map((l) => l.language)
                    .filter(Boolean)
                    .join(", ") || "—";
                  const score = app.aiMatchScore != null ? `${Math.round(app.aiMatchScore)}% AI match` : "not scored";
                  const status = String(app.status).replace(/_/g, " ");
                  const strengths = app.matchStrengths?.length ? ` | Strengths: ${app.matchStrengths.slice(0, 3).join(", ")}` : "";
                  const gaps = app.matchGaps?.length ? ` | Gaps: ${app.matchGaps.slice(0, 2).join(", ")}` : "";
                  return `  ${idx + 1}. ${name} — ${score} | Status: ${status} | ${expStr} | Latest: ${role} | Education: ${edu} | Location: ${s?.currentLocation ?? "—"} | Skills: ${skills} | Languages: ${langs}${strengths}${gaps}`;
                });
                sections.push(`### ${title}\n${lines.join("\n")}`);
              }

              applicantsBlock = `\n\n## Your Applicants (REAL candidates who applied — grouped by job, sorted by AI match score)\n${sections.join("\n\n")}\n\nWhen the user asks to screen, rank, shortlist, compare, or build interview briefs for candidates, use THIS data directly and reference candidates by name. Do NOT ask the user to paste CVs or job descriptions — you already have their profiles above. If a candidate the user names is not in this list, say you only have access to the applicants shown above.`;
            } else {
              applicantsBlock = `\n\n## Your Applicants\nNo applications have been received for your jobs yet. If the user asks to screen or rank candidates, tell them honestly that no applicants have applied yet — do not invent candidates.`;
            }
          }

          // Upcoming interviews — lets Interview AI answer "what's scheduled this week?"
          const employerInterviews = await Interview.find({
            employerId,
            status: { $in: ["scheduled", "confirmed", "rescheduled"] },
            scheduledAt: { $gte: new Date() },
          })
            .select("jobId jobSeekerId scheduledAt status")
            .sort({ scheduledAt: 1 })
            .limit(10)
            .populate("jobId", "title")
            .populate("jobSeekerId", "fullName")
            .lean();
          const interviewsBlock = employerInterviews.length
            ? `\n\n## Upcoming Interviews\n${employerInterviews.map((i) => {
                const title = (i.jobId as unknown as { title?: string } | null)?.title ?? "a job";
                const who = (i.jobSeekerId as unknown as { fullName?: string } | null)?.fullName ?? "a candidate";
                return `- ${who} for "${title}" — ${new Date(i.scheduledAt).toUTCString()} (${i.status})`;
              }).join("\n")}`
            : "";

          roleStatsContext = jobsBlock + applicantsBlock + interviewsBlock;
        }
      } catch (err) {
        logger.error({ err }, "[AI Chat] Failed to fetch employer data");
      }
    }

    // ─── Recent activity + page context injection ───────────────
    let pageContext = "";
    let recentActivityContext = "";

    const dataAwareContexts = [
      "admin_assist", "super_agent_assist", "agent_assist",
      "job_creator", "interview_ai", "screening_ai", "employer_assist",
    ];

    if (currentPage && dataAwareContexts.includes(context ?? "")) {
      pageContext = `\n\n## Current Page\nThe user is currently viewing: ${currentPage}`;
    }

    if (dataAwareContexts.includes(context ?? "")) {
      try {
        await connectDB();
        const recentLogs = await AuditLog.find({
          actorId: session.user.id,
          action: { $not: /^ai\./ }, // exclude AI chat logs themselves
        })
          .select("action resource resourceId meta createdAt")
          .sort({ createdAt: -1 })
          .limit(8)
          .lean();

        if (recentLogs.length > 0) {
          const activityLines = recentLogs.map((log) => {
            const time = new Date(log.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            const action = String(log.action).replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
            const resource = String(log.resource).replace(/[._]/g, " ");
            const detail = log.meta?.title ?? log.meta?.name ?? log.resourceId ?? "";
            return `- ${time}: ${action} on ${resource}${detail ? ` "${detail}"` : ""}`;
          });
          recentActivityContext = `\n\n## Recent Activity\n${activityLines.join("\n")}`;
        }
      } catch (err) {
        logger.error({ err }, "[AI Chat] Failed to fetch recent activity");
      }
    }

    const systemPrompt = getSystemPrompt(context ?? "", profileContext, jobsContext, roleStatsContext + pageContext + recentActivityContext);

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
      logger.error("[AI Chat] OPENROUTER_API_KEY not set");
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
      logger.error({ status: upstream.status, err }, "[AI Chat] OpenRouter error");
      return NextResponse.json({ error: "AI service error" }, { status: 502 });
    }

    await logActivity({
      actorId: session.user.id!,
      actorRole: userRole,
      action: "ai.chat_request",
      resource: "ai",
      meta: { messageCount: messages.length, currentPage },
      req,
    });

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
          try { controller.close(); } catch { /* already closed */ }
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
    if (error instanceof NextResponse) return error;
    logger.error({ error }, "[AI Chat Error]");
    return NextResponse.json(
      { error: "AI service error" },
      { status: 500 }
    );
  }
}

function getSystemPrompt(context: string, profileContext: string, jobsContext: string, roleStatsContext: string): string {
  const base =
    "You are an AI assistant for MPLOYEDIN, an AI-powered international recruitment platform for the Gulf region. Be helpful, professional, and concise." + SCOPE_GUARD;

  // Role-specific assistant contexts — use dedicated prompts with stats injection
  const assistantContexts: AssistantContext[] = [
    "job_creator", "interview_ai", "screening_ai",
    "admin_assist", "super_agent_assist", "agent_assist",
  ];
  if (assistantContexts.includes(context as AssistantContext)) {
    const prompt = getAssistantSystemPrompt(context as AssistantContext);
    // Append live stats if available (admin/super-agent/agent)
    return roleStatsContext ? prompt + roleStatsContext : prompt;
  }

  const jobRule = `\n\nCRITICAL RULE: NEVER invent, guess, or fabricate job listings. Only recommend real jobs from the "Live Jobs on MPLOYEDIN" section if provided. If no jobs section is provided or it is empty, tell the user to check their job feed.`;

  const profileAwareBase = profileContext
    ? `${base}${jobRule}

IMPORTANT: The user's profile is provided below. Use it to give personalized responses.
- When the user asks for job suggestions, ONLY recommend jobs from the "Live Jobs on MPLOYEDIN" list below.
- Do NOT ask for information that is already in their profile.
- If profile data is incomplete for a specific question, ask only for the missing piece.
- Reference their profile naturally (e.g., "Based on your React and Node.js experience…").

## How to recommend jobs

1. **Explain WHY it matches** — For each recommended job, explain which profile attributes align (e.g., "This matches because you have React + 3 years experience + preferred UAE location"). Never just list a job without a reason.

2. **Skill gap hints** — If a recommended job requires skills the user doesn't have, mention them helpfully: "You're a strong fit, but this role also asks for Docker — adding it could open more doors." Only mention 1–2 missing skills max per job — don't overwhelm.

3. **Match confidence** — Rate each recommendation:
   - **Strong match** when 3+ of the user's skills overlap AND location/experience align
   - **Good match** when 2+ skills overlap OR experience level fits well
   - **Worth exploring** when only 1 skill overlaps but the role aligns with their career direction
   Present this naturally (e.g., "Strong match — your TypeScript and Node.js experience directly align with this role").

4. **General skill advice** — When the user asks about career growth or improving their profile, compare their skills against the live jobs list and suggest the most commonly required skills they're missing.${profileContext}${jobsContext}`
    : base + jobRule;

  const contextPrompts: Record<string, string> = {
    cv_extraction:
      profileAwareBase + "\n\nHelp users understand their extracted CV data and suggest improvements.",
    job_match:
      profileAwareBase + "\n\nHelp users understand job matches, AI scores, and application tips.",
    interview_prep:
      profileAwareBase + "\n\nHelp candidates prepare for interviews with role-specific tips based on their profile and target roles.",
    employer_assist:
      base + " Help employers with job postings, candidate evaluation, and hiring." + roleStatsContext,
    general_assist: profileAwareBase,
  };

  return contextPrompts[context] ?? profileAwareBase;
}
