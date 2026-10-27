import { z } from "zod";

export const aiChatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string().max(4000),
      })
    )
    .min(1)
    .max(50, "Maximum 50 messages per request"),
  context: z.string().max(2000).optional(),
  currentPage: z.string().max(200).optional(),
});

export const aiReportSchema = z.object({
  query: z.string().min(1).max(500).trim(),
  reportType: z.string().max(100).optional(),
  scope: z.enum(["market", "platform"]).optional(),
  context: z.string().max(300).optional(),
  filters: z.record(z.string(), z.unknown()).optional(),
});

export const aiJobSearchSchema = z.object({
  query: z.string().min(1).max(500).trim(),
});

export const aiCandidateSearchSchema = z.object({
  query: z.string().min(1).max(500).trim(),
});

export const aiApplicationSearchSchema = z.object({
  query: z.string().min(1).max(500).trim(),
});

export const aiMatchSchema = z.object({
  jobId: z.string().regex(/^[a-f\d]{24}$/i),
  jobSeekerId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  applicationId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  candidateIds: z
    .array(z.string().regex(/^[a-f\d]{24}$/i))
    .max(100, "Maximum 100 candidates per match request")
    .optional(),
  // No `weights`: the score is the shared engine's, the same number on every
  // surface, so a caller cannot re-weight it. No client ever sent them.
});

export const aiSkillsGapSchema = z.object({
  jobSeekerId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  targetRole: z.string().max(200).optional(),
  targetJobId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  currentSkills: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
});

export const aiJobDescriptionSchema = z.object({
  title: z.string().min(2).max(200).trim(),
  industry: z.string().max(100).optional(),
  seniority: z.string().max(50).optional(),
  skills: z.array(z.string().max(100)).max(30).optional(),
  tone: z.enum(["professional", "casual", "creative"]).default("professional"),
});

/** POST /api/ai/enhance-text */
export const aiEnhanceTextSchema = z.object({
  text: z.string().min(1).max(2000).trim(),
  context: z.string().max(200).optional(),
  /** Quick-action mode. Defaults to "improve" for backward compatibility. */
  mode: z.enum(["improve", "shorten", "grammar", "suggest"]).optional(),
});

/**
 * POST /api/ai/cv-assistant — one chat turn over the whole CV. Only the
 * wording the assistant may change travels, plus facts for context; contact
 * details never leave the browser.
 */
const cvText = (max: number) => z.string().max(max).default("");
export const aiCvAssistantSchema = z.object({
  instruction: z.string().trim().min(1).max(4000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2000) }))
    .max(8)
    .default([]),
  cv: z.object({
    summary: cvText(1000),
    skills: z.array(z.string().max(80)).max(50).default([]),
    experience: z
      .array(z.object({
        jobTitle: cvText(150),
        company: cvText(150),
        startDate: cvText(10),
        endDate: cvText(10),
        isCurrent: z.boolean().default(false),
        description: cvText(4000),
      }))
      .max(20)
      .default([]),
    projects: z
      .array(z.object({ title: cvText(150), description: cvText(4000), techStack: z.array(z.string().max(60)).max(20).default([]) }))
      .max(15)
      .default([]),
    education: z
      .array(z.object({ degree: cvText(150), institution: cvText(150), field: cvText(150) }))
      .max(10)
      .default([]),
    certifications: z.array(z.string().max(200)).max(30).default([]),
  }),
});
export type AiCvAssistantInput = z.infer<typeof aiCvAssistantSchema>;

/** POST /api/ai/profile-fill */
export const aiProfileFillSchema = z.object({
  section: z.enum(["summary", "skills", "experience", "education", "languages"]),
  input: z.string().min(3).max(2000).trim(),
});

/** POST /api/ai/screen-candidates */
export const aiScreenCandidatesSchema = z.object({
  jobId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid jobId"),
  maxCandidates: z.number().int().min(1).max(20).default(10),
});

/** POST /api/ai/ats-check */
export const aiAtsCheckSchema = z.object({
  /** JobSeeker _id to analyze. Optional — job seekers analyze their own CV. */
  jobSeekerId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid jobSeekerId").optional(),
  /** Optional job to compute keyword coverage against. */
  jobId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid jobId").optional(),
  /** Force re-analysis even if a cached report exists. */
  force: z.boolean().optional().default(false),
});

/** POST /api/ai/interview-questions */
export const aiInterviewQuestionsSchema = z.object({
  jobTitle: z.string().min(1).max(200).trim(),
  candidateName: z.string().max(200).optional(),
  interviewId: z.string().max(50).optional(),
  skills: z.array(z.string().max(100)).max(15).optional(),
  experienceYears: z.number().min(0).max(60).optional(),
  questionType: z.enum(["technical", "behavioral", "culture_fit", "situational"]).optional(),
  count: z.number().int().min(1).max(15).default(8),
});

/** POST /api/ai/copilot/chat */
export const copilotChatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4000),
      })
    )
    .min(1)
    .max(30, "Maximum 30 messages per request"),
  currentPage: z.string().max(200).optional(),
});

/** POST /api/ai/copilot/execute */
export const copilotExecuteSchema = z.object({
  proposalId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid proposalId"),
});
