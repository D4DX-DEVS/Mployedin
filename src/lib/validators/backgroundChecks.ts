import { z } from "zod";
import { commonSchemas } from "./index";

/** Validators for employer background / reference checks (FG-7). */

const referenceContactSchema = z.object({
  name: z.string().trim().min(2).max(120),
  relationship: z.string().trim().max(120).optional(),
  company: z.string().trim().max(160).optional(),
  email: z.string().trim().email().max(160).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional(),
});

export const backgroundCheckCreateSchema = z.object({
  applicationId: commonSchemas.objectId,
  checkType: z.enum(["background", "reference", "both"]).default("reference"),
  references: z.array(referenceContactSchema).max(10).default([]),
  backgroundNotes: z.string().trim().max(2000).optional(),
});

const outcomeSchema = z.enum(["clear", "flagged", "failed", "unable_to_verify", "pending"]);

/**
 * One action on a check. Each names what the person is doing so the server can
 * hold it to that step's rules (who may do it, from which status) — see
 * src/lib/backgroundChecks/workflow.ts.
 */
export const backgroundCheckActionSchema = z.discriminatedUnion("action", [
  /** Take the check (claims it when nobody holds it) and mark it in progress. */
  z.object({ action: z.literal("start") }),
  /** Record verification progress: a referee's reply, or the findings so far. */
  z.object({
    action: z.literal("progress"),
    backgroundResults: z.string().trim().max(4000).optional(),
    reference: z
      .object({
        index: z.number().int().min(0).max(9),
        status: z.enum(["pending", "requested", "responded", "declined"]).optional(),
        feedback: z.string().trim().max(2000).optional(),
      })
      .optional(),
  }),
  /** Record the verdict and close the check. */
  z.object({
    action: z.literal("complete"),
    outcome: outcomeSchema.exclude(["pending"]),
    backgroundResults: z.string().trim().max(4000).optional(),
  }),
  /** Hand the check to a colleague or an agent. Null leaves it for whoever starts it. */
  z.object({ action: z.literal("assign"), assignedTo: commonSchemas.objectId.nullable() }),
  z.object({ action: z.literal("cancel") }),
  /** The employer's own notes on the request. */
  z.object({ action: z.literal("notes"), backgroundNotes: z.string().trim().max(2000) }),
]);

export type BackgroundCheckAction = z.infer<typeof backgroundCheckActionSchema>;

/** The subset an agent may send: they run checks but never assign, cancel or annotate them. */
export const staffBackgroundCheckActionSchema = backgroundCheckActionSchema.refine(
  (body) => body.action === "start" || body.action === "progress" || body.action === "complete",
  { message: "Not allowed" }
);
