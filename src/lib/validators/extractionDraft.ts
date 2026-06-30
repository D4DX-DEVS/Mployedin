import { z } from "zod";
import { commonSchemas } from "./index";

/**
 * Zod schemas for the ExtractionDraft REST surface
 * (GET/PATCH/DELETE under /api/ai/job-extract/drafts/[id]).
 *
 * These mirror the conventions in ./jobs.ts (zod + validateBody) and the
 * DraftedJob / DraftedJobStatus types in src/models/ExtractionDraft.ts.
 * Keep the shapes in sync if you touch the model.
 */

export const draftStatusEnum = z.enum(["pending", "posted", "skipped"]);

export const updateDraftJobSchema = z.object({
  /** Client-side index of the job being mutated. */
  index: z.number().int().min(0),
  /** New status to stamp on this entry. */
  status: draftStatusEnum,
  /** Populated when status === "posted" — the freshly-created Job _id. */
  postedJobId: commonSchemas.objectId.optional(),
});

export const patchExtractionDraftSchema = z
  .object({
    /** Replace the selection set (client Set<number> serialized to number[]). */
    selectedIndices: z.array(z.number().int().min(0)).max(200).optional(),
    /** Update one or more job entries' status atomically. */
    jobUpdates: z.array(updateDraftJobSchema).max(200).optional(),
  })
  .refine((v) => v.selectedIndices !== undefined || v.jobUpdates !== undefined, {
    message: "Provide at least one of selectedIndices or jobUpdates",
  });

/** Body accepted by POST /api/jobs when it needs to write back to a draft. */
export const extractionDraftRefSchema = z.object({
  extractionDraftId: commonSchemas.objectId,
  extractionDraftIndex: z.number().int().min(0),
});
