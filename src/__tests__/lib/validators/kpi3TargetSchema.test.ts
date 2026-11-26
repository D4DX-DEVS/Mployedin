/** @jest-environment node */
import { kpi3ProfileCreateSchema } from "@/lib/validators/targetProfiles";

const base = { assigneeId: "64b7f0c2a1b2c3d4e5f60718", assigneeRole: "agent" as const, year: 2026 };

describe("kpi3ProfileCreateSchema (SA-16)", () => {
  it("leaves currency unset when not sent, so an edit keeps the stored one", () => {
    const r = kpi3ProfileCreateSchema.safeParse({ ...base, jobTarget: 5 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.currency).toBeUndefined();
  });

  it("rejects absurd targets", () => {
    expect(kpi3ProfileCreateSchema.safeParse({ ...base, jobTarget: 5_000_000 }).success).toBe(false);
    expect(kpi3ProfileCreateSchema.safeParse({ ...base, revenueTarget: 1e15 }).success).toBe(false);
  });
});
