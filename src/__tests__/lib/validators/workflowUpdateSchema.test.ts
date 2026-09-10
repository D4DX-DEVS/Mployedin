/**
 * @jest-environment node
 */
import { workflowUpdateSchema } from "@/lib/validators/misc";

const stage = (id: string, order = 1) => ({ id, label: id, enabled: true, autoProgress: false, order });

describe("workflowUpdateSchema", () => {
  it("accepts canonical stage ids", () => {
    expect(workflowUpdateSchema.safeParse({ stages: [stage("applied"), stage("hired", 2)] }).success).toBe(true);
  });
  it("accepts legacy ids so unmigrated editors keep working", () => {
    expect(workflowUpdateSchema.safeParse({ stages: [stage("new"), stage("offer_extended", 2)] }).success).toBe(true);
  });
  it("rejects ids that are not application statuses", () => {
    const result = workflowUpdateSchema.safeParse({ stages: [stage("phone_screen")] });
    expect(result.success).toBe(false);
  });

  // The builder now saves rules only; stages are read-only in the UI.
  it("accepts a settings-only payload with the three hiring rules", () => {
    const result = workflowUpdateSchema.safeParse({
      settings: { autoRejectEnabled: true, autoRejectBelow: 45, notifyOnStageChange: false, shortlistTarget: 30 },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stages).toBeUndefined();
      expect(result.data.settings?.shortlistTarget).toBe(30);
    }
  });
  it("still tolerates the retired aiAutoScreen flag from old clients", () => {
    expect(workflowUpdateSchema.safeParse({ settings: { aiAutoScreen: true } }).success).toBe(true);
  });
  it("rejects a shortlist target outside 5–100 and a non-integer threshold", () => {
    expect(workflowUpdateSchema.safeParse({ settings: { shortlistTarget: 200 } }).success).toBe(false);
    expect(workflowUpdateSchema.safeParse({ settings: { shortlistTarget: 2 } }).success).toBe(false);
    expect(workflowUpdateSchema.safeParse({ settings: { autoRejectBelow: 40.5 } }).success).toBe(false);
  });
});
