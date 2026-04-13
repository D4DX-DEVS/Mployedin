/**
 * @jest-environment node
 */
import { jobCreateSchema, jobUpdateSchema } from "@/lib/validators/jobs";
import {
  applicationCreateSchema,
  applicationUpdateSchema,
  noteCreateSchema,
  bulkActionSchema,
} from "@/lib/validators/applications";
import {
  offerCreateSchema,
  offerRespondSchema,
} from "@/lib/validators/offers";
import {
  interviewCreateSchema,
  interviewBulkSchema,
  scorecardCreateSchema,
} from "@/lib/validators/interviews";
import { commonSchemas } from "@/lib/validators/index";

const validObjectId = "507f1f77bcf86cd799439011";
const futureDate = new Date(Date.now() + 86400000).toISOString();
const pastDate = new Date(Date.now() - 86400000).toISOString();

// ── commonSchemas ────────────────────────────────────────────────────────────

describe("commonSchemas", () => {
  test("objectId accepts valid 24-char hex", () => {
    expect(commonSchemas.objectId.safeParse(validObjectId).success).toBe(true);
  });

  test("objectId rejects short string", () => {
    expect(commonSchemas.objectId.safeParse("abc123").success).toBe(false);
  });

  test("email normalises to lowercase", () => {
    const result = commonSchemas.email.safeParse("USER@Example.COM");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("user@example.com");
  });

  test("email rejects invalid format", () => {
    expect(commonSchemas.email.safeParse("not-an-email").success).toBe(false);
  });
});

// ── jobCreateSchema ──────────────────────────────────────────────────────────

describe("jobCreateSchema", () => {
  const validJob = {
    title: "Software Engineer",
    description: "Build and maintain web applications with modern tools.",
  };

  test("validates minimal valid job", () => {
    expect(jobCreateSchema.safeParse(validJob).success).toBe(true);
  });

  test("validates full job with all optional fields", () => {
    const full = {
      ...validJob,
      category: "Engineering",
      location: { country: "US", city: "NYC", isRemote: true },
      requirements: { skills: ["TypeScript"], experienceMin: 2, experienceMax: 5 },
      salary: { min: 50000, max: 80000, currency: "USD", isNegotiable: true, period: "yearly" as const },
      expiresAt: futureDate,
      applicationMode: "auto" as const,
      employerId: validObjectId,
      vacancies: 3,
      tags: ["remote", "fullstack"],
      visibility: "public" as const,
      status: "active" as const,
    };
    expect(jobCreateSchema.safeParse(full).success).toBe(true);
  });

  test("rejects missing title", () => {
    const result = jobCreateSchema.safeParse({ description: "A".repeat(20) });
    expect(result.success).toBe(false);
  });

  test("rejects title shorter than 5 chars", () => {
    const result = jobCreateSchema.safeParse({ title: "Hi", description: "A".repeat(20) });
    expect(result.success).toBe(false);
  });

  test("rejects description shorter than 20 chars", () => {
    const result = jobCreateSchema.safeParse({ title: "Engineer", description: "short" });
    expect(result.success).toBe(false);
  });

  test("rejects salary where max < min", () => {
    const result = jobCreateSchema.safeParse({
      ...validJob,
      salary: { min: 100000, max: 50000, currency: "USD" },
    });
    expect(result.success).toBe(false);
  });

  test("rejects negative salary min", () => {
    const result = jobCreateSchema.safeParse({
      ...validJob,
      salary: { min: -1, max: 5000, currency: "USD" },
    });
    expect(result.success).toBe(false);
  });

  test("rejects invalid status enum", () => {
    const result = jobCreateSchema.safeParse({ ...validJob, status: "archived" });
    expect(result.success).toBe(false);
  });

  test("accepts hidden salary and no salary range", () => {
    const result = jobCreateSchema.safeParse({
      ...validJob,
      showSalary: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.showSalary).toBe(false);
    }
  });

  test("accepts optional applicant limit and omitted vacancies", () => {
    const result = jobCreateSchema.safeParse({
      ...validJob,
      maxApplicants: 25,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.maxApplicants).toBe(25);
      expect(result.data.vacancies).toBeUndefined();
    }
  });
});

// ── jobUpdateSchema ──────────────────────────────────────────────────────────

describe("jobUpdateSchema", () => {
  test("accepts empty object (all optional)", () => {
    expect(jobUpdateSchema.safeParse({}).success).toBe(true);
  });

  test("accepts status 'closed' (broader enum than create)", () => {
    expect(jobUpdateSchema.safeParse({ status: "closed" }).success).toBe(true);
  });

  test("rejects title below min length", () => {
    expect(jobUpdateSchema.safeParse({ title: "No" }).success).toBe(false);
  });

  test("accepts applicant cap and salary visibility updates", () => {
    const result = jobUpdateSchema.safeParse({ maxApplicants: 100, showSalary: false });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.maxApplicants).toBe(100);
      expect(result.data.showSalary).toBe(false);
    }
  });
});

// ── applicationCreateSchema ──────────────────────────────────────────────────

describe("applicationCreateSchema", () => {
  test("validates with required jobId", () => {
    const result = applicationCreateSchema.safeParse({ jobId: validObjectId });
    expect(result.success).toBe(true);
  });

  test("rejects missing jobId", () => {
    const result = applicationCreateSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  test("rejects invalid jobId format", () => {
    const result = applicationCreateSchema.safeParse({ jobId: "bad-id" });
    expect(result.success).toBe(false);
  });
});

// ── applicationUpdateSchema ──────────────────────────────────────────────────

describe("applicationUpdateSchema", () => {
  test("accepts valid status transition", () => {
    const result = applicationUpdateSchema.safeParse({ status: "screening" });
    expect(result.success).toBe(true);
  });

  test("requires rejectionReason when status is rejected", () => {
    const result = applicationUpdateSchema.safeParse({ status: "rejected" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("rejectionReason");
    }
  });

  test("passes when rejected with rejectionReason", () => {
    const result = applicationUpdateSchema.safeParse({
      status: "rejected",
      rejectionReason: "Not a fit",
    });
    expect(result.success).toBe(true);
  });

  test("rejects invalid status enum value", () => {
    const result = applicationUpdateSchema.safeParse({ status: "unknown_status" });
    expect(result.success).toBe(false);
  });

  test("rejects invalid withdrawalReason enum", () => {
    const result = applicationUpdateSchema.safeParse({ withdrawalReason: "bored" });
    expect(result.success).toBe(false);
  });
});

// ── offerCreateSchema ────────────────────────────────────────────────────────

describe("offerCreateSchema", () => {
  const validOffer = {
    applicationId: validObjectId,
    salary: { amount: 75000, currency: "USD", period: "annually" as const },
    startDate: new Date(Date.now() + 30 * 86400000).toISOString(),
  };

  test("validates a complete offer", () => {
    expect(offerCreateSchema.safeParse(validOffer).success).toBe(true);
  });

  test("rejects missing salary", () => {
    const { salary, ...rest } = validOffer;
    expect(offerCreateSchema.safeParse(rest).success).toBe(false);
  });

  test("rejects non-positive salary amount", () => {
    const result = offerCreateSchema.safeParse({
      ...validOffer,
      salary: { amount: 0, currency: "USD", period: "monthly" },
    });
    expect(result.success).toBe(false);
  });

  test("rejects start date in the past", () => {
    const result = offerCreateSchema.safeParse({
      ...validOffer,
      startDate: pastDate,
    });
    expect(result.success).toBe(false);
  });

  test("rejects invalid currency length", () => {
    const result = offerCreateSchema.safeParse({
      ...validOffer,
      salary: { amount: 5000, currency: "USDX", period: "monthly" },
    });
    expect(result.success).toBe(false);
  });
});

// ── offerRespondSchema ───────────────────────────────────────────────────────

describe("offerRespondSchema", () => {
  test("accepts 'accepted' without reason", () => {
    expect(offerRespondSchema.safeParse({ status: "accepted" }).success).toBe(true);
  });

  test("requires declineReason when declining", () => {
    const result = offerRespondSchema.safeParse({ status: "declined" });
    expect(result.success).toBe(false);
  });

  test("passes when declined with reason", () => {
    const result = offerRespondSchema.safeParse({
      status: "declined",
      declineReason: "Accepted another offer",
    });
    expect(result.success).toBe(true);
  });
});

// ── interviewCreateSchema ────────────────────────────────────────────────────

describe("interviewCreateSchema", () => {
  const validInterview = {
    applicationId: validObjectId,
    scheduledAt: futureDate,
    duration: 60,
    type: "video" as const,
  };

  test("validates a complete interview", () => {
    expect(interviewCreateSchema.safeParse(validInterview).success).toBe(true);
  });

  test("rejects scheduledAt in the past", () => {
    const result = interviewCreateSchema.safeParse({
      ...validInterview,
      scheduledAt: pastDate,
    });
    expect(result.success).toBe(false);
  });

  test("rejects duration below 15 min", () => {
    const result = interviewCreateSchema.safeParse({
      ...validInterview,
      duration: 5,
    });
    expect(result.success).toBe(false);
  });

  test("rejects duration above 480 min", () => {
    const result = interviewCreateSchema.safeParse({
      ...validInterview,
      duration: 500,
    });
    expect(result.success).toBe(false);
  });

  test("rejects invalid interview type", () => {
    const result = interviewCreateSchema.safeParse({
      ...validInterview,
      type: "smoke_signal",
    });
    expect(result.success).toBe(false);
  });

  test("allows empty string for meetLink", () => {
    const result = interviewCreateSchema.safeParse({
      ...validInterview,
      meetLink: "",
    });
    expect(result.success).toBe(true);
  });

  test("accepts offline and hybrid interview types", () => {
    expect(interviewCreateSchema.safeParse({ ...validInterview, type: "offline" }).success).toBe(true);
    expect(interviewCreateSchema.safeParse({ ...validInterview, type: "hybrid" }).success).toBe(true);
  });

  test("rejects legacy phone interview type", () => {
    expect(interviewCreateSchema.safeParse({ ...validInterview, type: "phone" }).success).toBe(false);
  });
});

describe("interviewBulkSchema", () => {
  test("accepts a bulk schedule request with application ids", () => {
    const result = interviewBulkSchema.safeParse({
      candidates: [{ jobSeekerId: validObjectId, applicationId: validObjectId }],
      scheduledAt: futureDate,
      duration: 45,
      type: "video",
    });
    expect(result.success).toBe(true);
  });
});

// ── scorecardCreateSchema ────────────────────────────────────────────────────

describe("scorecardCreateSchema", () => {
  const validScorecard = {
    scores: {
      technicalSkills: 4,
      communication: 3,
      cultureFit: 5,
      problemSolving: 2,
      motivation: 4,
    },
    recommendation: "yes" as const,
  };

  test("validates a complete scorecard", () => {
    expect(scorecardCreateSchema.safeParse(validScorecard).success).toBe(true);
  });

  test("rejects score below 1", () => {
    const result = scorecardCreateSchema.safeParse({
      ...validScorecard,
      scores: { ...validScorecard.scores, technicalSkills: 0 },
    });
    expect(result.success).toBe(false);
  });

  test("rejects score above 5", () => {
    const result = scorecardCreateSchema.safeParse({
      ...validScorecard,
      scores: { ...validScorecard.scores, communication: 6 },
    });
    expect(result.success).toBe(false);
  });

  test("rejects invalid recommendation enum", () => {
    const result = scorecardCreateSchema.safeParse({
      ...validScorecard,
      recommendation: "maybe",
    });
    expect(result.success).toBe(false);
  });
});

// ── noteCreateSchema & bulkActionSchema ──────────────────────────────────────

describe("noteCreateSchema", () => {
  test("validates note with content", () => {
    expect(noteCreateSchema.safeParse({ content: "Good candidate" }).success).toBe(true);
  });

  test("rejects empty content", () => {
    expect(noteCreateSchema.safeParse({ content: "" }).success).toBe(false);
  });
});

describe("bulkActionSchema", () => {
  test("validates a bulk reject action", () => {
    const result = bulkActionSchema.safeParse({
      applicationIds: [validObjectId],
      action: "reject",
      params: { rejectionReason: "Position filled" },
    });
    expect(result.success).toBe(true);
  });

  test("rejects empty applicationIds array", () => {
    const result = bulkActionSchema.safeParse({
      applicationIds: [],
      action: "reject",
    });
    expect(result.success).toBe(false);
  });
});
