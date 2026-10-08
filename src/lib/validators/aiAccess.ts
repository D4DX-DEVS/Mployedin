import { z } from "zod";

/** POST /api/admin/ai-access — issue a platform (mpi_) AI Data Access key. */
export const platformApiKeyCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  /** `insights:read` is always granted; `pii:read` un-redacts names/e-mails/phones. */
  pii: z.boolean().optional().default(false),
  rateLimitPerMin: z.number().int().min(10).max(1000).optional(),
  /** Days until expiry; omit for a non-expiring key. */
  expiresInDays: z.number().int().min(1).max(3650).optional(),
});

export type PlatformApiKeyCreateInput = z.infer<typeof platformApiKeyCreateSchema>;
