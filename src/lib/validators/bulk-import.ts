import { z } from "zod";

export const bulkImportSchema = z.object({
  type: z.enum(["users", "jobs", "employers"]),
  rows: z.array(z.record(z.string(), z.string().max(1000))).min(1).max(500),
});
