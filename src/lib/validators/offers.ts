import { z } from "zod";
import { commonSchemas } from "./index";

export const offerCreateSchema = z.object({
  applicationId: commonSchemas.objectId,
  salary: z.object({
    amount: z.number().positive("Salary amount must be positive"),
    currency: z.string().length(3, "Currency must be a 3-character code"),
    period: z.enum(["monthly", "annually"]),
  }),
  startDate: z
    .string()
    .transform((val) => new Date(val))
    .refine((date) => date > new Date(), "Start date must be in the future"),
  benefits: z
    .string()
    .max(2000, "Benefits must be at most 2000 characters")
    .optional(),
  notes: z
    .string()
    .max(1000, "Notes must be at most 1000 characters")
    .optional(),
  expiresAt: z
    .string()
    .transform((val) => new Date(val))
    .optional(),
});

export const offerRespondSchema = z
  .object({
    status: z.enum(["accepted", "declined"]),
    declineReason: z.string().max(500).optional(),
    signatureName: z.string().trim().min(2).max(120).optional(),
  })
  .refine(
    (data) => data.status !== "declined" || !!data.declineReason,
    {
      message: "Decline reason is required when declining an offer",
      path: ["declineReason"],
    }
  );
