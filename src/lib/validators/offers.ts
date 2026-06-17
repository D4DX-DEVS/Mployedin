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
    status: z.enum(["accepted", "declined", "countered"]),
    declineReason: z.string().max(500).optional(),
    signatureName: z.string().trim().min(2).max(120).optional(),
    counterOffer: z
      .object({
        amount: z.number().positive("Counter amount must be positive"),
        currency: z.string().length(3, "Currency must be a 3-character code"),
        period: z.enum(["monthly", "annually"]),
        note: z.string().max(500).optional(),
      })
      .optional(),
  })
  .refine(
    (data) => data.status !== "declined" || !!data.declineReason,
    {
      message: "Decline reason is required when declining an offer",
      path: ["declineReason"],
    }
  )
  .refine(
    (data) => data.status !== "countered" || !!data.counterOffer,
    {
      message: "Counter-offer details are required when countering",
      path: ["counterOffer"],
    }
  );

/** Employer/agent revises a pending or countered offer's terms. */
export const offerReviseSchema = z.object({
  salary: z.object({
    amount: z.number().positive("Salary amount must be positive"),
    currency: z.string().length(3, "Currency must be a 3-character code"),
    period: z.enum(["monthly", "annually"]),
  }),
  startDate: z
    .string()
    .transform((val) => new Date(val))
    .refine((date) => date > new Date(), "Start date must be in the future"),
  benefits: z.string().max(2000).optional(),
  notes: z.string().max(1000).optional(),
  expiresAt: z
    .string()
    .transform((val) => new Date(val))
    .optional(),
  revisionNote: z.string().max(500).optional(),
});

/** Employer/agent sends a reminder for a pending offer. */
export const offerRemindSchema = z.object({
  message: z.string().max(500).optional(),
});
