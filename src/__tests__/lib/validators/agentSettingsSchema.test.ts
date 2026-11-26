/** @jest-environment node */
import { agentSettingsUpdateSchema } from "@/lib/validators/settings";

describe("agentSettingsUpdateSchema (SA-14 / AG-16)", () => {
  it("rejects working hours that end before they start", () => {
    expect(agentSettingsUpdateSchema.safeParse({ workingHoursStart: "18:00", workingHoursEnd: "09:00" }).success).toBe(false);
    expect(agentSettingsUpdateSchema.safeParse({ workingHoursStart: "09:00", workingHoursEnd: "09:00" }).success).toBe(false);
  });

  it("accepts normal hours and a single side", () => {
    expect(agentSettingsUpdateSchema.safeParse({ workingHoursStart: "09:00", workingHoursEnd: "18:00" }).success).toBe(true);
    expect(agentSettingsUpdateSchema.safeParse({ workingHoursEnd: "18:00" }).success).toBe(true);
  });

  it("rejects an unknown timezone and accepts a real one", () => {
    expect(agentSettingsUpdateSchema.safeParse({ timezone: "Mars/Base" }).success).toBe(false);
    expect(agentSettingsUpdateSchema.safeParse({ timezone: "Asia/Dubai" }).success).toBe(true);
    expect(agentSettingsUpdateSchema.safeParse({ timezone: "" }).success).toBe(true);
  });
});
