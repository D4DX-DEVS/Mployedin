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
});
