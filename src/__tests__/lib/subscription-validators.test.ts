/**
 * @jest-environment node
 */
import {
  subscriptionPlanCreateSchema,
  subscriptionPlanUpdateSchema,
  subscriptionAssignSchema,
  subscriptionChangeSchema,
  subscriptionCancelSchema,
  subscriptionRenewSchema,
  invoiceUpdateSchema,
} from "@/lib/validators/subscriptions";

const validObjectId = "507f1f77bcf86cd799439011";
const validObjectId2 = "607f1f77bcf86cd799439022";

// ── Shared AI feature limit fixture ──────────────────────────────────────────

const validAiFeature = {
  feature: "ai_chat" as const,
  enabled: true,
  monthlyLimit: 50,
};

const validEmployerLimits = {
  maxActiveJobs: 10,
  maxApplicationsViewPerMonth: 100,
  maxTeamMembers: 5,
  aiFeatures: [validAiFeature],
  analyticsLevel: "basic" as const,
  dataExport: true,
  commTemplates: true,
  scorecardEvaluations: true,
  matchingWeightCustomization: true,
  workflowCustomization: true,
  prioritySupport: false,
  featuredJobListings: 3,
  brandedCompanyPage: false,
};

const validJobSeekerLimits = {
  maxApplicationsPerMonth: 30,
  aiFeatures: [validAiFeature],
  profileVisibilityBoost: false,
  salaryInsights: true,
  priorityApplicationReview: false,
  resumeBuilderAccess: true,
};

// ── subscriptionPlanCreateSchema ─────────────────────────────────────────────

describe("subscriptionPlanCreateSchema", () => {
  const validEmployerPlan = {
    name: "Gold Employer",
    targetRole: "employer" as const,
    tier: 2,
    price: 99.99,
    billingCycle: "monthly" as const,
    employerLimits: validEmployerLimits,
  };

  const validJobSeekerPlan = {
    name: "Silver Job Seeker",
    targetRole: "job_seeker" as const,
    tier: 1,
    price: 19.99,
    billingCycle: "monthly" as const,
    jobSeekerLimits: validJobSeekerLimits,
  };

  test("accepts valid employer plan", () => {
    expect(subscriptionPlanCreateSchema.safeParse(validEmployerPlan).success).toBe(true);
  });

  test("accepts valid job seeker plan", () => {
    expect(subscriptionPlanCreateSchema.safeParse(validJobSeekerPlan).success).toBe(true);
  });

  test("accepts plan with all optional fields", () => {
    const full = {
      ...validEmployerPlan,
      description: "Premium employer plan",
      currency: "USD",
      isActive: true,
      isDefault: false,
      sortOrder: 1,
    };
    expect(subscriptionPlanCreateSchema.safeParse(full).success).toBe(true);
  });

  test("rejects employer plan without employerLimits", () => {
    const { employerLimits, ...noLimits } = validEmployerPlan;
    const result = subscriptionPlanCreateSchema.safeParse(noLimits);
    expect(result.success).toBe(false);
  });

  test("rejects job_seeker plan without jobSeekerLimits", () => {
    const { jobSeekerLimits, ...noLimits } = validJobSeekerPlan;
    const result = subscriptionPlanCreateSchema.safeParse(noLimits);
    expect(result.success).toBe(false);
  });

  test("rejects employer plan with job_seeker limits instead", () => {
    const bad = {
      name: "Bad Plan",
      targetRole: "employer" as const,
      tier: 1,
      price: 10,
      billingCycle: "monthly" as const,
      jobSeekerLimits: validJobSeekerLimits,
    };
    expect(subscriptionPlanCreateSchema.safeParse(bad).success).toBe(false);
  });

  test("rejects empty name", () => {
    const result = subscriptionPlanCreateSchema.safeParse({ ...validEmployerPlan, name: "" });
    expect(result.success).toBe(false);
  });

  test("rejects negative price", () => {
    const result = subscriptionPlanCreateSchema.safeParse({ ...validEmployerPlan, price: -10 });
    expect(result.success).toBe(false);
  });

  test("rejects tier > 10", () => {
    const result = subscriptionPlanCreateSchema.safeParse({ ...validEmployerPlan, tier: 11 });
    expect(result.success).toBe(false);
  });

  test("rejects invalid billingCycle", () => {
    const result = subscriptionPlanCreateSchema.safeParse({ ...validEmployerPlan, billingCycle: "weekly" });
    expect(result.success).toBe(false);
  });

  test("rejects invalid AI feature key", () => {
    const badLimits = {
      ...validEmployerLimits,
      aiFeatures: [{ feature: "ai_invalid_feature", enabled: true, monthlyLimit: 10 }],
    };
    const result = subscriptionPlanCreateSchema.safeParse({ ...validEmployerPlan, employerLimits: badLimits });
    expect(result.success).toBe(false);
  });

  test("rejects negative monthlyLimit in AI features", () => {
    const badLimits = {
      ...validEmployerLimits,
      aiFeatures: [{ feature: "ai_chat", enabled: true, monthlyLimit: -5 }],
    };
    const result = subscriptionPlanCreateSchema.safeParse({ ...validEmployerPlan, employerLimits: badLimits });
    expect(result.success).toBe(false);
  });

  test("0 monthlyLimit is valid (unlimited)", () => {
    const limits = {
      ...validEmployerLimits,
      aiFeatures: [{ feature: "ai_chat", enabled: true, monthlyLimit: 0 }],
    };
    const result = subscriptionPlanCreateSchema.safeParse({ ...validEmployerPlan, employerLimits: limits });
    expect(result.success).toBe(true);
  });

  test("-1 maxActiveJobs is valid (unlimited)", () => {
    const limits = { ...validEmployerLimits, maxActiveJobs: -1 };
    const result = subscriptionPlanCreateSchema.safeParse({ ...validEmployerPlan, employerLimits: limits });
    expect(result.success).toBe(true);
  });

  test("rejects invalid analyticsLevel", () => {
    const limits = { ...validEmployerLimits, analyticsLevel: "pro" };
    const result = subscriptionPlanCreateSchema.safeParse({ ...validEmployerPlan, employerLimits: limits });
    expect(result.success).toBe(false);
  });
});

// ── subscriptionPlanUpdateSchema ─────────────────────────────────────────────

describe("subscriptionPlanUpdateSchema", () => {
  test("accepts partial update with just name", () => {
    expect(subscriptionPlanUpdateSchema.safeParse({ name: "Updated" }).success).toBe(true);
  });

  test("accepts partial update with just price", () => {
    expect(subscriptionPlanUpdateSchema.safeParse({ price: 49.99 }).success).toBe(true);
  });

  test("accepts empty object", () => {
    expect(subscriptionPlanUpdateSchema.safeParse({}).success).toBe(true);
  });

  test("rejects invalid tier", () => {
    expect(subscriptionPlanUpdateSchema.safeParse({ tier: -1 }).success).toBe(false);
  });
});

// ── subscriptionAssignSchema ─────────────────────────────────────────────────

describe("subscriptionAssignSchema", () => {
  const validAssign = { userId: validObjectId, planId: validObjectId2 };

  test("accepts valid assign", () => {
    expect(subscriptionAssignSchema.safeParse(validAssign).success).toBe(true);
  });

  test("accepts assign with optional fields", () => {
    const full = {
      ...validAssign,
      startDate: new Date().toISOString(),
      autoRenew: true,
      notes: "Initial assignment",
    };
    expect(subscriptionAssignSchema.safeParse(full).success).toBe(true);
  });

  test("rejects invalid userId", () => {
    expect(subscriptionAssignSchema.safeParse({ userId: "bad", planId: validObjectId }).success).toBe(false);
  });

  test("rejects missing planId", () => {
    expect(subscriptionAssignSchema.safeParse({ userId: validObjectId }).success).toBe(false);
  });
});

// ── subscriptionChangeSchema ─────────────────────────────────────────────────

describe("subscriptionChangeSchema", () => {
  test("accepts valid change", () => {
    const data = { userId: validObjectId, newPlanId: validObjectId2 };
    expect(subscriptionChangeSchema.safeParse(data).success).toBe(true);
  });

  test("accepts change with reason", () => {
    const data = { userId: validObjectId, newPlanId: validObjectId2, reason: "Upgrading" };
    expect(subscriptionChangeSchema.safeParse(data).success).toBe(true);
  });

  test("rejects missing newPlanId", () => {
    expect(subscriptionChangeSchema.safeParse({ userId: validObjectId }).success).toBe(false);
  });

  test("rejects reason > 500 chars", () => {
    const data = { userId: validObjectId, newPlanId: validObjectId2, reason: "x".repeat(501) };
    expect(subscriptionChangeSchema.safeParse(data).success).toBe(false);
  });
});

// ── subscriptionCancelSchema ─────────────────────────────────────────────────

describe("subscriptionCancelSchema", () => {
  test("accepts empty cancel (no reason)", () => {
    expect(subscriptionCancelSchema.safeParse({}).success).toBe(true);
  });

  test("accepts cancel with reason", () => {
    expect(subscriptionCancelSchema.safeParse({ reason: "No longer needed" }).success).toBe(true);
  });

  test("rejects reason > 500 chars", () => {
    expect(subscriptionCancelSchema.safeParse({ reason: "a".repeat(501) }).success).toBe(false);
  });
});

// ── subscriptionRenewSchema ──────────────────────────────────────────────────

describe("subscriptionRenewSchema", () => {
  test("accepts valid renewal", () => {
    expect(subscriptionRenewSchema.safeParse({ subscriptionId: validObjectId }).success).toBe(true);
  });

  test("accepts renewal with notes", () => {
    const data = { subscriptionId: validObjectId, notes: "Auto-renewed" };
    expect(subscriptionRenewSchema.safeParse(data).success).toBe(true);
  });

  test("rejects invalid subscriptionId", () => {
    expect(subscriptionRenewSchema.safeParse({ subscriptionId: "not-valid" }).success).toBe(false);
  });
});

// ── invoiceUpdateSchema ──────────────────────────────────────────────────────

describe("invoiceUpdateSchema", () => {
  test("accepts status paid", () => {
    expect(invoiceUpdateSchema.safeParse({ status: "paid" }).success).toBe(true);
  });

  test("accepts status void", () => {
    expect(invoiceUpdateSchema.safeParse({ status: "void" }).success).toBe(true);
  });

  test("accepts notes only", () => {
    expect(invoiceUpdateSchema.safeParse({ notes: "Payment received" }).success).toBe(true);
  });

  test("accepts empty object", () => {
    expect(invoiceUpdateSchema.safeParse({}).success).toBe(true);
  });

  test("rejects invalid status", () => {
    expect(invoiceUpdateSchema.safeParse({ status: "refunded" }).success).toBe(false);
  });

  test("rejects notes > 500 chars", () => {
    expect(invoiceUpdateSchema.safeParse({ notes: "x".repeat(501) }).success).toBe(false);
  });
});
